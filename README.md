# 🎙️ VoiceCursor Concierge — Backend (Convex)

An **iMessage-native concierge for visually impaired users**. The user speaks a
request ("get me an Uber home") via **Voice Cursor**; it reaches an AI agent
over iMessage (**Photon**); the agent orders the ride. Demo service is **Uber**,
but services are **pluggable** (Starbucks / DoorDash drop in with one file).

This repo is **only the backend** — the Convex app that stores state, runs the
pluggable service connectors, owns the order lifecycle, and exposes the contract
Photon calls. iMessage transport + the LLM brain are **Photon** (teammate); the
real ride call is the **Uber API** (teammate); voice I/O is **Voice Cursor**
(client app).

## Architecture (who owns what)

```
Voice Cursor (STT, right-Cmd) ──dictate──▶ Messages ──iMessage──▶ Photon (transport + brain)
                                                                       │  RPC
   say TTS ◀── local tts-helper ◀── Convex outbound (speak hint)       ▼
                                              ┌──────── CONVEX (this repo) ────────┐
                                              │ /photon/* contract · /mock/incoming │
                                              │ services (Uber stub) · orders FSM   │
                                              │ rule-based fallback agent · crons   │
                                              └────────────── Uber connector ──▶ Uber API
```

Primary flow: dictation → iMessage → Photon → Convex (context + tools) → brain →
`/photon/action` (quote / place) → Convex runs the connector → Photon replies
over iMessage and the local helper speaks money-spending confirmations aloud.

## Quick start

```bash
npm install
npx convex dev          # FIRST RUN: authenticates + links the wandering-skunk-190 deployment
                        # (opens a browser; or set CONVEX_DEPLOY_KEY). Leave it running.
npx convex run seed:run # registers the Uber service + a demo contact (home/work saved)
```

Set deployment env vars once (inside Convex, not in a file):

```bash
npx convex env set API_KEY dev-secret-change-me
# Optional — when teammates are ready:
npx convex env set UBER_API_BASE_URL https://<uber-teammate-endpoint>
npx convex env set PHOTON_WEBHOOK_URL https://<photon-listener>/send
```

### Device-free demo (no Photon / Voice Cursor / Uber needed)

```bash
CONVEX_SITE_URL=https://wandering-skunk-190.convex.site API_KEY=dev-secret-change-me \
  npx tsx scripts/demo.ts
```

Walks "get me an uber home" → emphatic price confirmation → "yes" → ride placed.
Inspect the `orders` table in the Convex dashboard for the full state trail.

### Eyes-free output (run on the Mac)

```bash
CONVEX_URL=https://wandering-skunk-190.convex.cloud npx tsx scripts/tts-helper.ts
```

Polls for unspoken outbound messages and reads them with macOS `say` (slower,
clearer voice for `emphatic` confirmations). Complements VoiceOver.

### Offline logic check

```bash
npx tsx scripts/test-parser.ts   # 14 assertions over the rule-based agent
```

---

## HTTP contract (served on `https://wandering-skunk-190.convex.site`)

All routes require header `X-Api-Key: <API_KEY>`.

### Photon → Convex (the brain calls these)

| Method | Path | Body / Query | Returns |
|---|---|---|---|
| POST | `/photon/message` | `{ handle, direction:"in"\|"out", text, source?, speak? }` | `{ conversationId }` |
| GET | `/photon/context` | `?conversationId=` | `{ handle, prefs, messages[], openOrders[], tools[] }` |
| GET | `/photon/tools` | — | `{ tools[] }` (per-service action schemas) |
| POST | `/photon/action` | `{ conversationId, serviceKey, action:"quote"\|"place"\|"status"\|"cancel", params }` | `{ ...result, suggestedReply:{ text, speak } }` |

`suggestedReply` is accessible-formatted text + a `speak` hint
(`none`/`normal`/`emphatic`) the brain can send verbatim, so the
confirm-before-commit UX stays consistent. `place` only acts on the latest
order in `awaiting_confirmation` — quote first.

### Convex → Photon (proactive)

When a cron detects an order status change, Convex POSTs `{ handle, text }` to
`PHOTON_WEBHOOK_URL` (with `X-Api-Key`) for delivery over iMessage. ⚠️ Photon
only allows outbound to allowlisted recipients — text the Photon number first.

### Demo / service callbacks

| Method | Path | Body | Purpose |
|---|---|---|---|
| POST | `/mock/incoming` | `{ handle, text }` | Run the rule-based agent end-to-end, no device |
| POST | `/events/uber` | `{ externalId, state, note? }` | Uber status callback → advances the order FSM |

---

## Adding a service (the "any service" pattern)

1. Implement `ServiceConnector` (`convex/services/types.ts`) in `convex/services/<name>.ts`
   — `quote` / `place` / `status` / `cancel` + a `toolSchema`.
2. Register it in `convex/services/index.ts`.
3. `npx convex run seed:run` to add its `services` row.

The brain automatically sees the new tool via `/photon/tools`. No other changes.

## Teammate hand-offs

- **Uber:** expose `POST /quote`, `/place`, `/status`, `/cancel` matching the
  shapes in `convex/services/uber.ts`; set `UBER_API_BASE_URL`. Until then the
  connector returns realistic fakes so the demo never blocks.
- **Photon:** call the `/photon/*` contract above; reference wiring lives in
  `~/Desktop/butterbase-hackathon/lib/photon.ts` + `scripts/photon-listener.ts`.
- **Voice Cursor (config, not code):** set the Remote Collaboration target to the
  **Messages** app, grant Accessibility. Hotkey = right-Cmd.

## File map

```
convex/
  schema.ts          tables + shared validators
  http.ts            HTTP contract (Photon RPC, mock ingress, callbacks)
  messages.ts        log / context / unspoken-outbound / prefs
  orders.ts          order state machine + queries
  agent.ts           inbound orchestrator (mock/fallback path)
  agent/fallback.ts  pure rule-based intent parser (unit-tested)
  dispatch.ts        executeServiceAction — the /photon/action engine
  photon.ts          getTools query + pushOutbound (proactive)
  maintenance.ts     pollOrders (status advance + proactive push)
  crons.ts           30s status-poll schedule
  services/          ServiceConnector interface, registry, Uber stub
  lib/format.ts      accessible reply text + speak hints
  seed.ts            service registry + demo contact
scripts/
  demo.ts            device-free end-to-end walkthrough
  tts-helper.ts      macOS `say` reader for eyes-free output
  test-parser.ts     offline logic check
```
