require('dotenv').config();

const REQUIRED_VARS = [
  'LINE_CHANNEL_ACCESS_TOKEN',
  'LINE_CHANNEL_SECRET',
  'LINE_USER_ID',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
];

const missing = REQUIRED_VARS.filter((v) => !process.env[v]);
if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const express = require('express');
const { messagingApi, middleware } = require('@line/bot-sdk');

const app = express();

const lineClient = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

const PORT = process.env.PORT || 3000;

function formatMessage(quote, deed, dayCount) {
  return [
    `🎋 竹筒歲月 Bamboo Bank — Day ${dayCount}`,
    '',
    `「${quote.textZh}」`,
    `"${quote.text}"`,
    ` — ${quote.author}`,
    '',
    `💡 今日善行 Today's good deed:`,
    `   ${deed.textZh}`,
    `   ${deed.text}`,
    '',
    `🪙 今天存下你的五毛錢。`,
    `   Save your 50 cents today.`,
    `   日行一善，聚沙成塔。`,
  ].join('\n');
}

const { Redis } = require('@upstash/redis');
const quotes = require('../data/quotes.json');
const deeds = require('../data/deeds.json');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

function getTaipeiDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
}

async function pushMessage(text) {
  const message = {
    to: process.env.LINE_USER_ID,
    messages: [{ type: 'text', text }],
  };
  try {
    return await lineClient.pushMessage(message);
  } catch (err) {
    await new Promise((r) => setTimeout(r, 1000));
    return await lineClient.pushMessage(message);
  }
}

app.get('/send', async (req, res) => {
  try {
    const today = getTaipeiDate();
    const setResult = await redis.set(`sent:${today}`, '1', { nx: true, ex: 172800 });

    if (!setResult) {
      console.log(`SKIPPED already_sent date=${today}`);
      return res.json({ sent: false, reason: 'already_sent' });
    }

    const dayCount = await redis.incr('dayCount');
    const quote = quotes[(dayCount - 1) % quotes.length];
    const deed = deeds[(dayCount - 1) % deeds.length];
    const message = formatMessage(quote, deed, dayCount);

    await pushMessage(message);

    console.log(`SENT day=${dayCount} date=${today}`);
    res.json({ sent: true, dayCount });
  } catch (err) {
    console.error(`ERROR ${new Date().toISOString()} ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

const lineMiddleware = middleware({
  channelSecret: process.env.LINE_CHANNEL_SECRET,
});

app.post('/webhook', lineMiddleware, (req, res) => {
  res.sendStatus(200);
});

// Error handler for LINE webhook signature validation failures
app.use((err, req, res, _next) => {
  if (err.message && err.message.includes('signature')) {
    return res.status(401).json({ error: err.message });
  }
  res.status(500).json({ error: err.message });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`Bamboo Bank listening on port ${PORT}`));
}

module.exports = app;
module.exports.formatMessage = formatMessage;
module.exports.pushMessage = pushMessage;
