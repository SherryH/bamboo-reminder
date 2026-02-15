# Bamboo Bank Daily Reminder - Design Document

**Date**: 2026-02-15
**Status**: Draft (pending critique-loop review)

## Inspiration

Based on Tzu Chi's Bamboo Bank philosophy (竹筒歲月): In 1966, Master Cheng Yen gave 30 followers bamboo coin banks and asked each to save 50 NT cents daily. When asked "why not donate $15/month?", she explained that daily donations cultivate daily compassion. The practice matters more than the amount — "many grains of rice make a bushel; many drops make a river."

## Overview

A LINE Bot that sends a daily message at lunchtime (12:00 PM) containing:
1. An inspirational quote (Tzu Chi / Buddhist / general kindness)
2. A good deed suggestion
3. A donation/savings reminder

## Architecture

```
┌──────────────┐     ┌──────────────┐
│  Cron Job    │────▶│  LINE        │
│  (12:00 PM)  │     │  Messaging   │
│              │     │  API         │
└──────┬───────┘     └──────┬───────┘
       │                     │
       ▼                     ▼
┌──────────────┐     ┌──────────────┐
│  Quote +     │     │  Your LINE   │
│  Deed JSON   │     │  Chat        │
│  files       │     │              │
└──────────────┘     └──────────────┘
```

## Tech Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Runtime | Node.js | LINE SDK is JS-native, already installed |
| LINE SDK | `@line/bot-sdk` | Official, well-maintained |
| Hosting | Railway / Render free tier | Free cron support, no server management |
| Data | JSON files | No database needed for v1 |
| Scheduler | Platform cron or `node-cron` | Daily trigger at 12:00 PM |

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
- ~100 quotes from Tzu Chi teachings, Buddhist wisdom, and general kindness
- Fields: `text`, `author`, `category`

### deeds.json
- ~100 good deed suggestions
- Categories: kindness, gratitude, generosity, mindfulness
- Fields: `text`, `category`

### state.json
- `dayCount`: number of days since start
- `lastSentDate`: ISO date string to prevent duplicate sends
- `quoteIndex`: current position in quote rotation
- `deedIndex`: current position in deed rotation

## Core Logic

1. Cron triggers at 12:00 PM daily
2. Read `state.json` for current day count and indices
3. Pick next quote from `quotes.json` (sequential rotation)
4. Pick next deed from `deeds.json` (sequential rotation)
5. Format message using template
6. Send via LINE Messaging API (push message)
7. Update `state.json` with new indices and date

## Project Structure

```
bamboo-reminder/
├── src/
│   ├── index.js          # Entry point, cron setup
│   ├── messenger.js      # LINE API message sending
│   ├── formatter.js      # Message template formatting
│   └── state.js          # State read/write (state.json)
├── data/
│   ├── quotes.json       # Quote collection
│   ├── deeds.json        # Good deed suggestions
│   └── state.json        # Runtime state (gitignored)
├── docs/
│   └── plans/
│       └── 2026-02-15-bamboo-reminder-design.md
├── .env.example          # LINE_CHANNEL_ACCESS_TOKEN, LINE_USER_ID
├── .gitignore
├── package.json
└── README.md
```

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Bot authentication |
| `LINE_USER_ID` | Your LINE user ID (push message target) |

## Future Extensions (Out of Scope for v1)

### Extension 1: Charity Donation Link
- Swap text message for LINE FlexMessage with a button
- Button links to charity donation page (Tzu Chi, etc.)
- No payment processing on our side

### Extension 2: Bank API / Savings Jar
- Track daily amount in state.json (step 1)
- Add LINE Rich Menu with "My Savings" view (step 2)
- Integrate with bank API for auto-transfer (step 3)

### Extension 3: Multi-user Support
- Add webhook endpoint for friend registrations
- Per-user state (day counter, preferred time)
- Store user IDs in a simple JSON or SQLite

## Design Decisions

1. **JSON over database**: Single-user bot with <200 records total. No query complexity needed.
2. **Sequential rotation over random**: Ensures all quotes/deeds are seen before repeating.
3. **Push message over broadcast**: v1 is single-user, push is simpler.
4. **Platform cron over self-hosted**: Eliminates server uptime concerns.
