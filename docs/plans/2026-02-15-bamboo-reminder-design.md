# Bamboo Bank Daily Reminder - Design Document

**Date**: 2026-02-15
**Status**: v3 (post critique-loop round 2 — final)

## Inspiration

Based on Tzu Chi's Bamboo Bank philosophy (竹筒歲月): In 1966, Master Cheng Yen gave 30 followers bamboo coin banks and asked each to save 50 NT cents daily. When asked "why not donate $15/month?", she explained that daily donations cultivate daily compassion. The practice matters more than the amount — "many grains of rice make a bushel; many drops make a river."

## Overview

A LINE Bot that sends a daily message at lunchtime (12:00 PM Taiwan time) containing:
1. An inspirational quote (Tzu Chi / Buddhist / general kindness)
2. A good deed suggestion
3. A donation/savings reminder

## Architecture

```
┌──────────────────┐     ┌──────────────┐     ┌──────────────┐
│  GitHub Actions  │────▶│  Express     │────▶│  LINE        │
│  Cron            │     │  Server      │     │  Messaging   │
│  0 4 * * * (UTC) │     │  /send       │     │  API         │
│  = 12 PM Taipei  │     │  /webhook    │     └──────┬───────┘
└──────────────────┘     └──────┬───────┘            │
                                │                     ▼
                         ┌──────▼───────┐      ┌──────────────┐
                         │  Upstash     │      │  Your LINE   │
                         │  Redis (free)│      │  Chat        │
                         │  (state)     │      └──────────────┘
                         └──────────────┘
```

## Tech Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Runtime | Node.js | LINE SDK is JS-native |
| LINE SDK | `@line/bot-sdk` | Official, handles webhook signature validation |
| Server | Express (minimal) | Required for LINE webhook + /send endpoint |
| Hosting | Render free tier | Free web service, wakes on incoming requests |
| State | Upstash Redis (free tier) | Persists across deploys, 10K commands/day free |
| Scheduler | GitHub Actions cron | Reliable, free, works even when service sleeps |

## Daily Message Format

```
🎋 Bamboo Bank — Day 43

"Many grains of rice make a bushel;
 many drops make a river."
 — Master Cheng Yen

💡 Today's good deed:
   Send a thank-you message to someone
   who helped you this week.

🪙 Save your 50 cents today.
   Small daily kindness accumulates.
```

## Data Files

### quotes.json
- ~30 quotes from Tzu Chi teachings, Buddhist wisdom, and general kindness
- Fields: `text`, `author`

### deeds.json
- ~30 good deed suggestions
- Fields: `text`

## State (Upstash Redis)

Single key strategy using atomic operations:

- **`dayCount`** (integer): incremented atomically with `INCR`
- **`sent:<YYYY-MM-DD>`** (string): set with `SET sent:2026-02-15 1 NX EX 172800`
  - `NX` = only set if key doesn't exist (prevents duplicate sends atomically)
  - `EX 172800` = auto-expires after 48 hours (self-cleaning)

Quote/deed indices derived: `dayCount % quotes.length`, `dayCount % deeds.length`.

No race conditions: Redis `SET NX` is atomic — if two requests hit simultaneously, only one succeeds.

## Core Logic

1. GitHub Actions cron fires at `0 4 * * *` UTC (= 12:00 PM Asia/Taipei)
2. GitHub Actions sends HTTP GET to `https://<app>.onrender.com/send`
   - Workflow has `timeout-minutes: 2` to handle Render cold start (30-90s)
3. Server wakes, handles `/send`:
   a. Compute today's date in Asia/Taipei: `new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' })`
   b. Attempt `SET sent:<today> 1 NX EX 172800` in Redis
   c. If SET returns null → already sent today, return `{ sent: false, reason: "already_sent" }`
   d. If SET succeeds → proceed:
      - `INCR dayCount` to get current count
      - Derive quote: `(dayCount - 1) % quotes.length`
      - Derive deed: `(dayCount - 1) % deeds.length`
      - Format message with template literal
      - Send via LINE push message
      - Return `{ sent: true, dayCount }`
   e. On LINE API failure: retry once after 1s, then return error
4. Log all outcomes (sent, skipped, error) to stdout with timestamp

## Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/send` | GET | Trigger daily message. Returns `{ sent, dayCount }` or `{ sent: false, reason }` |
| `/webhook` | POST | LINE webhook with `@line/bot-sdk` signature validation middleware |

## Project Structure

```
bamboo-reminder/
├── src/
│   └── index.js          # Express server, all routes, LINE push, state logic
├── data/
│   ├── quotes.json       # 30 quotes
│   └── deeds.json        # 30 good deed suggestions
├── .github/
│   └── workflows/
│       └── daily-reminder.yml  # Cron trigger at 0 4 * * * UTC
├── docs/
│   └── plans/
│       └── 2026-02-15-bamboo-reminder-design.md
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## Environment Variables

| Variable | Purpose | Format |
|----------|---------|--------|
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Bot auth (long-lived v2 token) | JWT-like string from LINE Developer Console |
| `LINE_CHANNEL_SECRET` | Webhook signature validation | Hex string from LINE Developer Console |
| `LINE_USER_ID` | Push message target | 33-char string starting with `U` |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis endpoint | `https://xxx.upstash.io` |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis auth | Token from Upstash console |

## Startup Validation

On server boot, check all 5 env vars exist and are non-empty. Exit with clear error message listing which vars are missing. No external service calls at startup (fail fast on `/send` instead).

## Error Handling

- LINE API failure on `/send`: retry once after 1s delay
- If retry also fails: log error, return 500
- Redis unavailable: log error, return 500 (no message sent = safe failure)
- All errors logged to stdout with timestamp (Render captures logs)
- Distinct log messages: `SENT day=43`, `SKIPPED already_sent`, `ERROR <details>`

## GitHub Actions Workflow

```yaml
name: Daily Reminder
on:
  schedule:
    - cron: '0 4 * * *'  # 4 AM UTC = 12 PM Asia/Taipei
  workflow_dispatch: {}    # Manual trigger for testing
jobs:
  send:
    runs-on: ubuntu-latest
    timeout-minutes: 2
    steps:
      - name: Trigger daily message
        run: |
          response=$(curl -s -w "\n%{http_code}" "${{ secrets.RENDER_URL }}/send")
          http_code=$(echo "$response" | tail -1)
          body=$(echo "$response" | head -1)
          echo "Status: $http_code"
          echo "Response: $body"
          if [ "$http_code" != "200" ]; then
            echo "::error::Failed to send daily message"
            exit 1
          fi
```

## Future Extensions (Out of Scope for v1)

### Extension 1: Charity Donation Link
- Swap text message for LINE FlexMessage with a donation button

### Extension 2: Savings Tracker
- Add running total to Redis state, display in daily message

### Extension 3: Multi-user Support
- Store user IDs in Redis, iterate for push messages

## Design Decisions

1. **Upstash Redis over filesystem**: Ephemeral hosting = filesystem resets on deploy.
2. **GitHub Actions cron over node-cron**: Service sleeps on free tier; external trigger is reliable.
3. **Redis `SET NX` over read-check-write**: Atomic duplicate prevention, no race conditions.
4. **Single source file**: ~80 lines doesn't warrant multiple modules.
5. **30 items over 100**: Ship fast, add content without code changes.
6. **Env-only startup validation**: Don't call external services at boot (Render restart loops).
7. **Long-lived v2 token**: Avoids silent 30-day expiry.
8. **Webhook signature validation**: Security best practice, required for LINE certification.
9. **48-hour key expiry**: Self-cleaning sent flags, no Redis cleanup needed.
10. **UTC cron with comment**: GitHub Actions only supports UTC; comment documents Taipei mapping.

## Change Log

### v1 → v2 (Critique Loop Round 1)
- **Fixed**: Ephemeral filesystem → Upstash Redis for state persistence
- **Fixed**: node-cron on sleeping service → GitHub Actions external cron
- **Added**: Express server with /webhook, /send, /health endpoints
- **Added**: Startup validation, error handling, timezone, token guidance
- **Simplified**: 4→2 source files, derived indices, 100→30 items, removed category field

### v2 → v3 (Critique Loop Round 2)
- **Fixed**: Race condition → Redis `SET NX` atomic duplicate prevention
- **Fixed**: GitHub Actions cron timezone → explicit UTC with Taipei comment
- **Fixed**: Render cold start → `timeout-minutes: 2` in workflow
- **Added**: LINE webhook signature validation with `LINE_CHANNEL_SECRET`
- **Added**: `workflow_dispatch` for manual testing
- **Added**: Explicit date computation in Asia/Taipei timezone
- **Added**: Distinct log messages (SENT/SKIPPED/ERROR)
- **Simplified**: Removed /health endpoint (status returned from /send)
- **Simplified**: 2→1 source file (index.js only)
- **Simplified**: Startup validation → env vars only, no external calls
- **Simplified**: Retry 2x 5s → 1x 1s
- **Removed**: x-line-retry-key (deferred, SET NX handles duplicates)
- **Removed**: lastSentDate field (replaced by atomic sent:<date> keys)
