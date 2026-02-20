# Bamboo Bank Daily Reminder

A LINE Bot that sends you a daily message with an inspirational quote, a good deed suggestion, and a savings reminder — inspired by Tzu Chi's Bamboo Bank philosophy.

## Why This Project Exists

In 1966, Master Cheng Yen gave 30 followers bamboo coin banks and asked each to save 50 NT cents daily before going to the market. When asked "why not just donate $15 per month?", she explained that the purpose was not the amount — it was the daily act of giving. Dropping a coin into a bamboo bank each morning cultivates a habit of compassion. Over time, many grains of rice make a bushel; many drops make a river (粒米成籮，滴水成河).

This project brings that idea into a modern daily practice. Instead of a physical bamboo bank, you get a LINE message at lunchtime each day that:

1. Shares a bilingual (Chinese/English) quote on kindness and compassion
2. Suggests one small good deed you can do today
3. Reminds you to set aside your daily savings

The goal is not to build a complex app — it's to build a daily habit.

## What It Does

Every day at 12:00 PM Taiwan time, a GitHub Actions cron job triggers the bot. The bot picks a quote and a deed from its collection, formats a bilingual message, and sends it to your LINE chat via the LINE Messaging API.

Here's an example of what the daily message looks like:

```
🎋 竹筒歲月 Bamboo Bank — Day 43

「粒米成籮，滴水成河。」
"Many grains of rice make a bushel;
 many drops make a river."
 — 證嚴法師 Master Cheng Yen

💡 今日善行 Today's good deed:
   傳一則感謝訊息給這週幫助過你的人。
   Send a thank-you message to someone
   who helped you this week.

🪙 今天存下你的五毛錢。
   Save your 50 cents today.
   日行一善，聚沙成塔。
```

The bot tracks which day you're on and prevents duplicate messages using Upstash Redis for state persistence.

## Tech Stack

- **Node.js + Express** — Minimal server with `/send` and `/webhook` endpoints
- **@line/bot-sdk** — Official LINE Messaging API SDK
- **Upstash Redis** — Tracks day count and prevents duplicate sends (free tier)
- **GitHub Actions** — Cron scheduler that triggers the daily message
- **Render** — Free-tier hosting for the Express server

## Setup

### Prerequisites

- A [LINE Developer](https://developers.line.biz/) account with a Messaging API channel
- An [Upstash](https://upstash.com/) Redis database (free tier)
- A [Render](https://render.com/) account (or similar hosting) to deploy the server

### Environment Variables

Create a `.env` file based on `.env.example`:

| Variable | Purpose |
|----------|---------|
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Bot long-lived v2 token |
| `LINE_CHANNEL_SECRET` | Webhook signature validation |
| `LINE_USER_IDS` | Your LINE user ID (push message target) |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis auth token |

### Run Locally

```bash
npm install
npm start
```

The server starts on port 3000. Visit `http://localhost:3000/send` to trigger a message manually.

### Deploy

1. Deploy to Render (or your preferred platform)
2. Set the environment variables in your hosting dashboard
3. Add `RENDER_URL` as a secret in your GitHub repo settings
4. The GitHub Actions workflow (`.github/workflows/daily-reminder.yml`) handles the daily schedule

## Adding Friends as Recipients

The bot already supports multiple recipients via the `LINE_USER_IDS` environment variable (comma-separated).

### 1. Get your friend's LINE user ID

When someone adds your bot as a friend on LINE, a **follow event** is sent to your `/webhook` endpoint. The event payload contains their user ID. To capture it, update the webhook handler in `src/index.js`:

```js
app.post('/webhook', lineMiddleware, (req, res) => {
  for (const event of req.body.events) {
    if (event.type === 'follow') {
      console.log(`NEW FOLLOWER userId=${event.source.userId}`);
    }
  }
  res.sendStatus(200);
});
```

Have your friend scan your bot's QR code (found in the [LINE Developer Console](https://developers.line.biz/) under your channel's Messaging API tab). Their user ID will appear in your server logs.

### 2. Add their user ID

Append the new user ID to `LINE_USER_IDS`, separated by a comma:

```
LINE_USER_IDS=Uxxxxx_you,Uxxxxx_friend1,Uxxxxx_friend2
```

That's it — the bot will send the daily message to all listed users.

> **Note:** The LINE Messaging API free tier allows 200 push messages per month. Each recipient counts as one message per day, so with 6 friends you'd use ~180 messages/month.

## Project Structure

```
src/index.js          — Express server, LINE push logic, all routes
data/quotes.json      — ~30 bilingual inspirational quotes
data/deeds.json       — ~30 bilingual good deed suggestions
.github/workflows/    — GitHub Actions cron trigger
docs/plans/           — Design documents
```

## License

Personal project. Not currently licensed for redistribution.
