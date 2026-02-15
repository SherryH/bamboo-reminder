# Bamboo Bank Daily Reminder

A LINE Bot that sends daily inspirational quotes, good deed suggestions, and donation reminders. Inspired by Tzu Chi's Bamboo Bank philosophy (竹筒歲月).

## Project Overview

- **Type**: LINE Bot (Node.js)
- **Purpose**: Daily reminder to cultivate compassion through small acts and donations
- **Design Doc**: `docs/plans/2026-02-15-bamboo-reminder-design.md`

## Development Workflow

- Use `/critique-loop` skill for planning (see `.claude/skills/critique-loop.md`)
- Plan files go in `docs/plans/`
- Follow the design doc for implementation

## Tech Stack

- Node.js
- `@line/bot-sdk` for LINE Messaging API
- JSON files for data storage (no database)
- Platform cron (Railway/Render) for scheduling

## Project Structure

```
src/           → Application source code
data/          → Quote and deed JSON data files
docs/plans/    → Design documents
.claude/skills → Claude Code skills
```

## Key Rules

- v1 is single-user (your personal bot)
- No database — JSON files only
- No payment integration in v1
- Keep it simple — YAGNI
