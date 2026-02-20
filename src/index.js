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
const app = express();

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

if (require.main === module) {
  app.listen(PORT, () => console.log(`Bamboo Bank listening on port ${PORT}`));
}

module.exports = app;
module.exports.formatMessage = formatMessage;
