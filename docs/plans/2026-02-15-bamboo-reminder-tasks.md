# Bamboo Bank Implementation Tasks

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a LINE Bot that sends daily inspirational quotes, good deed suggestions, and donation reminders at noon Taipei time.

**Architecture:** Express server on Render free tier with Upstash Redis for state. GitHub Actions cron triggers GET /send daily. Single source file (~80 lines).

**Tech Stack:** Node.js, Express, @line/bot-sdk, @upstash/redis, Jest + Supertest

**Source Specs:**
- `docs/plans/2026-02-15-bamboo-reminder-specs.md`
- `docs/plans/2026-02-15-bamboo-reminder-design.md`

**Project Context (auto-detected):**
- Test runner: Jest (to be configured — greenfield project)
- Component library: N/A (server-only, no UI)
- API pattern: Express routes per CLAUDE.md
- DB: Upstash Redis REST API
- i18n: bilingual (Traditional Chinese + English) in data files and message format
- Key libraries: `@line/bot-sdk`, `express`, `@upstash/redis`, `dotenv`
- Import aliases: none (plain JS, relative imports)
- Mandatory patterns: YAGNI, single source file, mock at infrastructure boundaries

---

## Assumptions

| ID | Assumption | Impact if Wrong | Slice |
|----|-----------|-----------------|-------|
| A1 | LINE Bot channel already created in LINE Developer Console | Can't get credentials to test | All |
| A2 | Upstash Redis free account already created | Can't test state persistence | 1, 2 |
| A3 | @line/bot-sdk v10+ supports push message and middleware | API may differ | 1, 4 |
| A4 | Upstash REST client supports SET with NX and EX options | Duplicate prevention may need different approach | 2 |
| A5 | Render free tier serves Express apps without special config | Deployment may need adjustments | 3 |

---

## Coverage Matrix

| AC | Description | Task | Status |
|----|-------------|------|--------|
| S1-AC1 | Successful message send | Task 1.2, 1.3, 1.4 | pending |
| S1-AC2 | Message rotates sequentially | Task 1.2 | pending |
| S1-AC3 | Content wraps around | Task 1.2 | pending |
| S1-AC4 | LINE API failure retries once | Task 1.3 | pending |
| S1-AC5 | LINE API failure after retry returns error | Task 1.3 | pending |
| S1-AC6 | Redis unavailable returns safe error | Task 1.4 | pending |
| S1-AC7 | Missing env vars prevent server start | Task 1.1 | pending |
| S2-AC1 | Duplicate request blocked | Task 2.1 | pending |
| S2-AC2 | New day allows sending | Task 2.1 | pending |
| S2-AC3 | Duplicate prevention is atomic | Task 2.2 | pending |
| S2-AC4 | Sent keys auto-expire | Task 2.1 | pending |
| S2-AC5 | Date computed in Asia/Taipei | Task 2.1 | pending |
| S4-AC1 | Valid webhook accepted | Task 4.1 | pending |
| S4-AC2 | Invalid signature rejected | Task 4.1 | pending |
| S4-AC3 | Missing signature rejected | Task 4.1 | pending |
| S3-AC1 | GitHub Actions triggers at correct time | Task 3.1 | pending |
| S3-AC2 | Workflow handles cold start | Task 3.1 | pending |
| S3-AC3 | Workflow reports failure | Task 3.1 | pending |
| S3-AC4 | Manual trigger works | Task 3.1 | pending |

---

## Slice 0: Project Scaffolding

### Task 0.1: Initialize project and create data files

**Traces to:** Foundation for all slices
**Files:**
- Create: `package.json`
- Create: `data/quotes.json`
- Create: `data/deeds.json`
- Update: `.env.example`
- Update: `.gitignore`

**Steps:**

1. **Initialize package.json**

```json
{
  "name": "bamboo-reminder",
  "version": "1.0.0",
  "description": "Daily good deed and donation reminder LINE Bot",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "test": "jest",
    "test:watch": "jest --watch"
  },
  "dependencies": {
    "@line/bot-sdk": "^10.0.0",
    "@upstash/redis": "^1.34.0",
    "express": "^4.21.0",
    "dotenv": "^16.4.0"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "supertest": "^7.0.0"
  }
}
```

2. **Create data/quotes.json** with 30 bilingual quotes (Traditional Chinese + English):

```json
[
  { "text": "Many grains of rice make a bushel; many drops make a river.", "textZh": "粒米成籮，滴水成河。", "author": "證嚴法師 Master Cheng Yen" },
  { "text": "With gratitude, we gain blessings; with love, we gain wisdom.", "textZh": "感恩得福，以愛得智。", "author": "證嚴法師 Master Cheng Yen" },
  { "text": "A kind word can warm three winter months.", "textZh": "良言一句三冬暖。", "author": "日本諺語 Japanese Proverb" },
  { "text": "The best time to plant a tree was twenty years ago. The second best time is now.", "textZh": "種樹最好的時間是二十年前，其次是現在。", "author": "中國諺語 Chinese Proverb" },
  { "text": "If you light a lamp for someone, it will also brighten your own path.", "textZh": "為別人點一盞燈，也照亮了自己的路。", "author": "佛教格言 Buddhist Saying" },
  { "text": "Do not dwell in the past, do not dream of the future, concentrate the mind on the present moment.", "textZh": "不念過去，不畏將來，心繫當下。", "author": "佛陀 Buddha" },
  { "text": "Thousands of candles can be lit from a single candle, and the life of the candle will not be shortened.", "textZh": "千燈可從一燈點燃，而此燈之光不減。", "author": "佛陀 Buddha" },
  { "text": "An ounce of practice is worth more than tons of preaching.", "textZh": "一分的實踐勝過千言萬語的說教。", "author": "甘地 Mahatma Gandhi" },
  { "text": "No act of kindness, no matter how small, is ever wasted.", "textZh": "善行無論多小，皆不虛度。", "author": "伊索 Aesop" },
  { "text": "We make a living by what we get, but we make a life by what we give.", "textZh": "我們靠獲取謀生，但靠付出創造人生。", "author": "邱吉爾 Winston Churchill" },
  { "text": "The fragrance always stays in the hand that gives the rose.", "textZh": "贈人玫瑰，手有餘香。", "author": "Hada Bejar" },
  { "text": "When you are kind to others, it not only changes you, it changes the world.", "textZh": "善待他人，不僅改變了你自己，也改變了世界。", "author": "Harold Kushner" },
  { "text": "Happiness is not something ready-made. It comes from your own actions.", "textZh": "幸福不是現成的，它來自你自己的行動。", "author": "達賴喇嘛 Dalai Lama" },
  { "text": "In a gentle way, you can shake the world.", "textZh": "以溫柔的方式，你可以撼動世界。", "author": "甘地 Mahatma Gandhi" },
  { "text": "The purpose of life is not to be happy. It is to be useful, to be honorable, to be compassionate.", "textZh": "人生的目的不是追求快樂，而是有用、有尊嚴、有慈悲。", "author": "愛默生 Ralph Waldo Emerson" },
  { "text": "Giving is not just about making a donation. It is about making a difference.", "textZh": "付出不只是捐款，而是創造改變。", "author": "Kathy Calvin" },
  { "text": "Even a small star shines in the darkness.", "textZh": "即使是一顆小星星，也能在黑暗中閃耀。", "author": "芬蘭諺語 Finnish Proverb" },
  { "text": "The greatest good you can do for another is not just share your riches, but reveal to them their own.", "textZh": "你能為他人做的最大善事，不只是分享財富，而是讓他們發現自己的富足。", "author": "迪斯雷利 Benjamin Disraeli" },
  { "text": "Love and compassion are necessities, not luxuries. Without them, humanity cannot survive.", "textZh": "愛與慈悲是必需品，不是奢侈品。沒有它們，人類無法存續。", "author": "達賴喇嘛 Dalai Lama" },
  { "text": "One good deed has many claimants.", "textZh": "一件善事，眾人受益。", "author": "意第緒諺語 Yiddish Proverb" },
  { "text": "To understand everything is to forgive everything.", "textZh": "了解一切，就是原諒一切。", "author": "佛陀 Buddha" },
  { "text": "What we have done for ourselves alone dies with us; what we have done for others and the world remains.", "textZh": "為自己做的隨我們而逝，為他人做的永留世間。", "author": "Albert Pike" },
  { "text": "The simplest acts of kindness are by far more powerful than a thousand heads bowing in prayer.", "textZh": "最簡單的善行，遠比千人叩首祈禱更有力量。", "author": "甘地 Mahatma Gandhi" },
  { "text": "When we give cheerfully and accept gratefully, everyone is blessed.", "textZh": "歡喜付出，感恩接受，人人皆蒙福。", "author": "馬雅·安傑洛 Maya Angelou" },
  { "text": "Compassion is the basis of morality.", "textZh": "慈悲是道德的根基。", "author": "叔本華 Arthur Schopenhauer" },
  { "text": "Every charitable act is a stepping stone toward heaven.", "textZh": "每一個慈善行為，都是通往天堂的踏腳石。", "author": "比徹 Henry Ward Beecher" },
  { "text": "Those who bring sunshine to the lives of others cannot keep it from themselves.", "textZh": "為他人帶來陽光的人，自己也無法不被照亮。", "author": "巴里 J.M. Barrie" },
  { "text": "Real generosity is doing something nice for someone who will never find out.", "textZh": "真正的慷慨，是為不會知道的人做好事。", "author": "克拉克 Frank A. Clark" },
  { "text": "Life is mostly froth and bubble; two things stand like stone: kindness in another's trouble, courage in your own.", "textZh": "人生多泡影，唯二事如磐石：他人困難時的善良，自己困難時的勇氣。", "author": "哥登 Adam Lindsay Gordon" },
  { "text": "Save fifty cents each day; the intent of a good heart, accumulated daily, becomes immeasurable.", "textZh": "每天存五毛錢，日積月累，善念無量。", "author": "證嚴法師 Master Cheng Yen" }
]
```

3. **Create data/deeds.json** with 30 bilingual deeds (Traditional Chinese + English):

```json
[
  { "text": "Send a thank-you message to someone who helped you this week.", "textZh": "傳一則感謝訊息給這週幫助過你的人。" },
  { "text": "Compliment a coworker on something specific they did well.", "textZh": "讚美同事一件他們做得很好的事。" },
  { "text": "Hold the door open for the next three people behind you.", "textZh": "為身後的三個人扶住門。" },
  { "text": "Call a family member you haven't spoken to in a while.", "textZh": "打電話給一位許久沒聯絡的家人。" },
  { "text": "Leave a positive review for a local business you enjoy.", "textZh": "為你喜歡的店家留下正面評價。" },
  { "text": "Offer to help a colleague with a task they're struggling with.", "textZh": "主動幫助正在苦惱的同事。" },
  { "text": "Write a handwritten note of appreciation for someone.", "textZh": "手寫一張感謝卡給某個人。" },
  { "text": "Donate an item you no longer need to someone who could use it.", "textZh": "把不需要的物品捐給需要的人。" },
  { "text": "Smile and greet a stranger today.", "textZh": "今天對陌生人微笑打招呼。" },
  { "text": "Let someone go ahead of you in line.", "textZh": "讓排在你後面的人先。" },
  { "text": "Share a useful article or resource with a friend.", "textZh": "分享一篇有用的文章給朋友。" },
  { "text": "Pick up a piece of litter you see on your walk today.", "textZh": "撿起路上看到的一片垃圾。" },
  { "text": "Send an encouraging message to someone going through a tough time.", "textZh": "傳一則鼓勵的訊息給正在經歷困難的人。" },
  { "text": "Prepare a small treat or snack for your family or coworkers.", "textZh": "為家人或同事準備一份小點心。" },
  { "text": "Listen fully to someone today without interrupting.", "textZh": "今天專心聆聽一個人說話，不打斷。" },
  { "text": "Tip a little extra at a restaurant or cafe.", "textZh": "在餐廳或咖啡廳多給一點小費。" },
  { "text": "Forgive someone who wronged you — let go of the resentment.", "textZh": "原諒一個曾經傷害你的人，放下怨恨。" },
  { "text": "Teach someone a skill you know well.", "textZh": "教別人一項你擅長的技能。" },
  { "text": "Send a message to an old friend just to say you're thinking of them.", "textZh": "傳訊息給老朋友，告訴他你想念他。" },
  { "text": "Offer your seat to someone on public transport.", "textZh": "在大眾運輸工具上讓座給有需要的人。" },
  { "text": "Water a plant or tend to something living today.", "textZh": "今天澆一棵植物或照顧一個生命。" },
  { "text": "Say 'please' and 'thank you' with extra sincerity today.", "textZh": "今天說「請」和「謝謝」時多一份真誠。" },
  { "text": "Donate to a cause you care about — even a small amount counts.", "textZh": "捐款給你關心的事業——即使金額很小也有意義。" },
  { "text": "Write down three things you're grateful for today.", "textZh": "寫下今天感恩的三件事。" },
  { "text": "Check in on a neighbor, especially if they live alone.", "textZh": "關心一下鄰居，尤其是獨居的人。" },
  { "text": "Bring reusable bags or containers to reduce waste today.", "textZh": "今天帶環保袋或容器來減少浪費。" },
  { "text": "Give someone the benefit of the doubt today.", "textZh": "今天多給別人一些善意的理解。" },
  { "text": "Share your umbrella or offer help when it rains.", "textZh": "下雨時分享你的傘或伸出援手。" },
  { "text": "Spend 5 minutes tidying a shared space (kitchen, office, hallway).", "textZh": "花五分鐘整理一個公共空間。" },
  { "text": "End the day by reflecting on one kind thing someone did for you.", "textZh": "在一天結束時，回想一件別人為你做的善事。" }
]
```

4. **Update .env.example**:

```
LINE_CHANNEL_ACCESS_TOKEN=your-long-lived-v2-token   # From LINE Developer Console
LINE_CHANNEL_SECRET=your-channel-secret-hex-string    # From LINE Developer Console
LINE_USER_ID=Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx        # 33-char string starting with 'U'
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io         # From Upstash console
UPSTASH_REDIS_REST_TOKEN=your-upstash-rest-token      # From Upstash console
PORT=3000                                              # Optional, defaults to 3000
```

5. **Update .gitignore** — add `node_modules/` and `coverage/` if not present. Remove stale `data/state.json` entry (no longer used — state is in Upstash Redis).

   **Note:** Also ensure your local `.env` has all 5 required variables set (even dummy values for local testing). The current `.env` is missing `LINE_CHANNEL_SECRET`, `UPSTASH_REDIS_REST_URL`, and `UPSTASH_REDIS_REST_TOKEN`.

6. **Run `npm install`** to generate lock file.

7. **Commit:** "Add project scaffolding, data files, and dependencies"

---

## Slice 1: User receives daily inspiration message

### Task 1.1: Env validation on startup

**Traces to:** S1-AC7
**Assumes:** A1 — LINE Bot credentials exist
**Files:**
- Create: `src/index.js` (initial version with validation only)
- Create: `src/__tests__/index.test.js`

**Steps:**

1. **Write failing test:**

```javascript
// src/__tests__/index.test.js
const REQUIRED_VARS = [
  'LINE_CHANNEL_ACCESS_TOKEN',
  'LINE_CHANNEL_SECRET',
  'LINE_USER_ID',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
];

describe('Env validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      LINE_CHANNEL_ACCESS_TOKEN: 'test-token',
      LINE_CHANNEL_SECRET: 'test-secret',
      LINE_USER_ID: 'U1234567890abcdef1234567890abcdef',
      UPSTASH_REDIS_REST_URL: 'https://test.upstash.io',
      UPSTASH_REDIS_REST_TOKEN: 'test-redis-token',
      PORT: '3000',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test('S1-AC7: exits with error when LINE_CHANNEL_ACCESS_TOKEN is missing', () => {
    delete process.env.LINE_CHANNEL_ACCESS_TOKEN;
    const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    const mockError = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => require('../index')).toThrow('process.exit called');
    expect(mockError).toHaveBeenCalledWith(
      expect.stringContaining('LINE_CHANNEL_ACCESS_TOKEN')
    );

    mockExit.mockRestore();
    mockError.mockRestore();
  });

  test('S1-AC7: exits listing all missing variables', () => {
    delete process.env.LINE_CHANNEL_ACCESS_TOKEN;
    delete process.env.UPSTASH_REDIS_REST_URL;
    const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    const mockError = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => require('../index')).toThrow('process.exit called');
    expect(mockError).toHaveBeenCalledWith(
      expect.stringContaining('LINE_CHANNEL_ACCESS_TOKEN')
    );
    expect(mockError).toHaveBeenCalledWith(
      expect.stringContaining('UPSTASH_REDIS_REST_URL')
    );

    mockExit.mockRestore();
    mockError.mockRestore();
  });

  test('server starts when all env vars present', () => {
    const mockListen = jest.fn();
    jest.mock('express', () => {
      const app = {
        get: jest.fn(),
        post: jest.fn(),
        listen: mockListen,
        use: jest.fn(),
      };
      return jest.fn(() => app);
    });
    jest.mock('@line/bot-sdk');
    jest.mock('@upstash/redis');

    expect(() => require('../index')).not.toThrow();
  });
});
```

2. **Verify test fails** (no src/index.js implementation yet).

3. **Implement** `src/index.js` (initial skeleton):

```javascript
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

if (require.main === module) {
  app.listen(PORT, () => console.log(`Bamboo Bank listening on port ${PORT}`));
}

module.exports = app;
```

4. **Verify tests pass.**

5. **Commit:** "Add env validation on startup (S1-AC7)"

---

### Task 1.2: Message formatting function

**Traces to:** S1-AC1, S1-AC2, S1-AC3
**Assumes:** A1 — data files exist with correct schema
**Files:**
- Update: `src/index.js` (add formatMessage function)
- Update: `src/__tests__/index.test.js`

**Steps:**

1. **Write failing tests:**

```javascript
// Add to src/__tests__/index.test.js

const quotes = require('../../data/quotes.json');
const deeds = require('../../data/deeds.json');

// Helper: extract formatMessage for testing
// We'll export it from index.js for testability
describe('formatMessage', () => {
  let formatMessage;

  beforeAll(() => {
    // Set env vars before requiring
    process.env.LINE_CHANNEL_ACCESS_TOKEN = 'test';
    process.env.LINE_CHANNEL_SECRET = 'test';
    process.env.LINE_USER_ID = 'U1234567890abcdef1234567890abcdef';
    process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test';

    jest.mock('express', () => {
      const app = { get: jest.fn(), post: jest.fn(), listen: jest.fn(), use: jest.fn() };
      return jest.fn(() => app);
    });
    jest.mock('@line/bot-sdk');
    jest.mock('@upstash/redis');

    const mod = require('../index');
    formatMessage = mod.formatMessage;
  });

  test('S1-AC1: includes quote, deed, donation reminder, and day number in both languages', () => {
    const msg = formatMessage(quotes[0], deeds[0], 1);

    expect(msg).toContain(quotes[0].textZh);
    expect(msg).toContain(quotes[0].text);
    expect(msg).toContain(quotes[0].author);
    expect(msg).toContain(deeds[0].textZh);
    expect(msg).toContain(deeds[0].text);
    expect(msg).toContain('Save your 50 cents today');
    expect(msg).toContain('Day 1');
  });

  test('S1-AC2: uses correct quote and deed for dayCount 5', () => {
    const quoteIndex = 5 % quotes.length;
    const deedIndex = 5 % deeds.length;
    const msg = formatMessage(quotes[quoteIndex], deeds[deedIndex], 6);

    expect(msg).toContain(quotes[quoteIndex].text);
    expect(msg).toContain(quotes[quoteIndex].textZh);
    expect(msg).toContain(deeds[deedIndex].text);
    expect(msg).toContain(deeds[deedIndex].textZh);
    expect(msg).toContain('Day 6');
  });

  test('S1-AC3: wraps around after exhausting items', () => {
    const quoteIndex = 30 % quotes.length; // = 0
    const msg = formatMessage(quotes[quoteIndex], deeds[0], 31);

    expect(msg).toContain(quotes[0].text);
    expect(msg).toContain(quotes[0].textZh);
    expect(msg).toContain('Day 31');
  });
});
```

2. **Verify tests fail.**

3. **Implement** — add to `src/index.js`:

```javascript
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

module.exports.formatMessage = formatMessage;
```

4. **Verify tests pass.**

5. **Commit:** "Add message formatting with sequential rotation (S1-AC1, AC2, AC3)"

---

### Task 1.3: LINE push message with retry

**Traces to:** S1-AC1, S1-AC4, S1-AC5
**Assumes:** A3 — @line/bot-sdk v10 push message API
**Tools:** Context7 (@line/bot-sdk push message API)
**Files:**
- Update: `src/index.js` (add pushMessage function)
- Update: `src/__tests__/index.test.js`

**Steps:**

1. **Write failing tests:**

```javascript
// Add to src/__tests__/index.test.js

describe('pushMessage', () => {
  let pushMessage;
  let mockPush;

  beforeAll(() => {
    jest.resetModules();
    process.env.LINE_CHANNEL_ACCESS_TOKEN = 'test-token';
    process.env.LINE_CHANNEL_SECRET = 'test-secret';
    process.env.LINE_USER_ID = 'U1234567890abcdef1234567890abcdef';
    process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test';

    mockPush = jest.fn();
    jest.mock('@line/bot-sdk', () => ({
      messagingApi: {
        MessagingApiClient: jest.fn(() => ({ pushMessage: mockPush })),
      },
      middleware: jest.fn(() => (req, res, next) => next()),
    }));
    jest.mock('express', () => {
      const app = { get: jest.fn(), post: jest.fn(), listen: jest.fn(), use: jest.fn() };
      return jest.fn(() => app);
    });
    jest.mock('@upstash/redis');

    const mod = require('../index');
    pushMessage = mod.pushMessage;
  });

  beforeEach(() => {
    mockPush.mockReset();
  });

  test('S1-AC1: sends push message to configured user', async () => {
    mockPush.mockResolvedValue({});

    await pushMessage('Hello World');

    expect(mockPush).toHaveBeenCalledWith({
      to: 'U1234567890abcdef1234567890abcdef',
      messages: [{ type: 'text', text: 'Hello World' }],
    });
  });

  test('S1-AC4: retries once after 1s on failure', async () => {
    mockPush
      .mockRejectedValueOnce(new Error('LINE API error'))
      .mockResolvedValueOnce({});

    const start = Date.now();
    await pushMessage('Hello');
    const elapsed = Date.now() - start;

    expect(mockPush).toHaveBeenCalledTimes(2);
    expect(elapsed).toBeGreaterThanOrEqual(900); // ~1s delay
  });

  test('S1-AC5: throws after retry also fails', async () => {
    mockPush
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'));

    await expect(pushMessage('Hello')).rejects.toThrow('fail 2');
    expect(mockPush).toHaveBeenCalledTimes(2);
  });
});
```

2. **Verify tests fail.**

3. **Implement** — add to `src/index.js`:

```javascript
const { messagingApi } = require('@line/bot-sdk');

const lineClient = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
});

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

module.exports.pushMessage = pushMessage;
```

4. **Verify tests pass.**

5. **Commit:** "Add LINE push message with single retry (S1-AC1, AC4, AC5)"

---

### Task 1.4: GET /send endpoint

**Traces to:** S1-AC1, S1-AC6
**Assumes:** A2 — Upstash Redis account exists, A4 — SET NX supported
**Tools:** Context7 (@upstash/redis REST client)
**Files:**
- Update: `src/index.js` (add /send route)
- Create: `src/__tests__/send.test.js`

**Steps:**

1. **Write failing tests:**

```javascript
// src/__tests__/send.test.js
const request = require('supertest');

describe('GET /send', () => {
  let app;
  let mockRedisSet;
  let mockRedisIncr;
  let mockPush;

  beforeEach(() => {
    jest.resetModules();
    process.env.LINE_CHANNEL_ACCESS_TOKEN = 'test-token';
    process.env.LINE_CHANNEL_SECRET = 'test-secret';
    process.env.LINE_USER_ID = 'U1234567890abcdef1234567890abcdef';
    process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test';

    mockRedisSet = jest.fn();
    mockRedisIncr = jest.fn();
    mockPush = jest.fn().mockResolvedValue({});

    jest.mock('@upstash/redis', () => ({
      Redis: jest.fn(() => ({
        set: mockRedisSet,
        incr: mockRedisIncr,
      })),
    }));

    jest.mock('@line/bot-sdk', () => ({
      messagingApi: {
        MessagingApiClient: jest.fn(() => ({ pushMessage: mockPush })),
      },
      middleware: jest.fn(() => (req, res, next) => next()),
    }));

    app = require('../index');
  });

  test('S1-AC1: sends message and returns { sent: true, dayCount }', async () => {
    mockRedisSet.mockResolvedValue('OK'); // SET NX succeeded
    mockRedisIncr.mockResolvedValue(1);   // dayCount = 1

    const res = await request(app).get('/send');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sent: true, dayCount: 1 });
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  test('S1-AC1: message contains bilingual quote, deed, and day number', async () => {
    mockRedisSet.mockResolvedValue('OK');
    mockRedisIncr.mockResolvedValue(1);

    await request(app).get('/send');

    const sentText = mockPush.mock.calls[0][0].messages[0].text;
    expect(sentText).toContain('Day 1');
    expect(sentText).toContain('Save your 50 cents today');
    expect(sentText).toContain('今天存下你的五毛錢');
    expect(sentText).toContain('竹筒歲月');
    expect(sentText).toContain('Bamboo Bank');
  });

  test('S1-AC6: returns 500 when Redis is unavailable', async () => {
    mockRedisSet.mockRejectedValue(new Error('Redis connection failed'));

    const res = await request(app).get('/send');

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
    expect(mockPush).not.toHaveBeenCalled(); // Safe failure
  });
});
```

2. **Verify tests fail.**

3. **Implement** — add to `src/index.js`:

```javascript
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
```

4. **Verify tests pass.**

5. **Commit:** "Add GET /send endpoint with Redis state (S1-AC1, S1-AC6)"

---

### Task 1.5: BDD Integration Test — Slice 1

**Traces to:** S1-AC1 through S1-AC7
**Type:** BDD
**Files:**
- Create: `src/__tests__/slice1.bdd.test.js`

**Complete test code:**

```javascript
// src/__tests__/slice1.bdd.test.js
const request = require('supertest');

describe('Slice 1: User receives daily inspiration message', () => {
  let app;
  let mockRedisSet;
  let mockRedisIncr;
  let mockPush;

  beforeEach(() => {
    jest.resetModules();
    process.env.LINE_CHANNEL_ACCESS_TOKEN = 'test-token';
    process.env.LINE_CHANNEL_SECRET = 'test-secret';
    process.env.LINE_USER_ID = 'U1234567890abcdef1234567890abcdef';
    process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test';

    mockRedisSet = jest.fn().mockResolvedValue('OK');
    mockRedisIncr = jest.fn().mockResolvedValue(1);
    mockPush = jest.fn().mockResolvedValue({});

    jest.mock('@upstash/redis', () => ({
      Redis: jest.fn(() => ({
        set: mockRedisSet,
        incr: mockRedisIncr,
      })),
    }));

    jest.mock('@line/bot-sdk', () => ({
      messagingApi: {
        MessagingApiClient: jest.fn(() => ({ pushMessage: mockPush })),
      },
      middleware: jest.fn(() => (req, res, next) => next()),
    }));

    app = require('../index');
  });

  describe('AC1: Successful message send', () => {
    it('Given valid credentials and data, When GET /send, Then sends bilingual formatted LINE message', async () => {
      // Given: server running with valid credentials, dayCount = 0
      mockRedisIncr.mockResolvedValue(1);

      // When: GET /send
      const res = await request(app).get('/send');

      // Then: message sent with bilingual quote, deed, reminder, day number
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ sent: true, dayCount: 1 });
      expect(mockPush).toHaveBeenCalledTimes(1);

      const text = mockPush.mock.calls[0][0].messages[0].text;
      expect(text).toContain('Day 1');
      expect(text).toContain('Save your 50 cents today');
      expect(text).toContain('今天存下你的五毛錢');
      expect(text).toMatch(/「.+」/); // Contains a Chinese quote
      expect(text).toMatch(/".+"/); // Contains an English quote
    });
  });

  describe('AC2: Message rotates sequentially', () => {
    it('Given dayCount is 5, When GET /send, Then uses quote[5] and deed[5] in both languages', async () => {
      // Given: dayCount will be 6 after INCR
      mockRedisIncr.mockResolvedValue(6);

      // When
      const res = await request(app).get('/send');

      // Then: uses index 5 (dayCount-1 % 30)
      const quotes = require('../../data/quotes.json');
      const deeds = require('../../data/deeds.json');
      const text = mockPush.mock.calls[0][0].messages[0].text;
      expect(text).toContain(quotes[5].text);
      expect(text).toContain(quotes[5].textZh);
      expect(text).toContain(deeds[5].text);
      expect(text).toContain(deeds[5].textZh);
      expect(text).toContain('Day 6');
    });
  });

  describe('AC3: Content wraps around', () => {
    it('Given dayCount is 30, When GET /send, Then wraps to quote[0] in both languages', async () => {
      // Given: dayCount = 31 after INCR, 30 % 30 = 0
      mockRedisIncr.mockResolvedValue(31);

      // When
      await request(app).get('/send');

      // Then
      const quotes = require('../../data/quotes.json');
      const text = mockPush.mock.calls[0][0].messages[0].text;
      expect(text).toContain(quotes[0].text);
      expect(text).toContain(quotes[0].textZh);
      expect(text).toContain('Day 31');
    });
  });

  describe('AC4: LINE API failure retries once', () => {
    it('Given LINE API fails once then succeeds, When GET /send, Then returns success', async () => {
      // Given
      mockPush
        .mockRejectedValueOnce(new Error('LINE fail 1'))
        .mockResolvedValueOnce({});

      // When
      const res = await request(app).get('/send');

      // Then: message still sent successfully after retry
      expect(res.status).toBe(200);
      expect(res.body.sent).toBe(true);
      expect(mockPush).toHaveBeenCalledTimes(2);
    });
  });

  describe('AC5: LINE API failure after retry returns error', () => {
    it('Given LINE API fails twice, When GET /send, Then returns 500', async () => {
      // Given
      mockPush
        .mockRejectedValueOnce(new Error('LINE fail 1'))
        .mockRejectedValueOnce(new Error('LINE fail 2'));

      // When
      const res = await request(app).get('/send');

      // Then
      expect(res.status).toBe(500);
      expect(res.body.error).toContain('LINE fail 2');
    });
  });

  describe('AC6: Redis unavailable returns safe error', () => {
    it('Given Redis unreachable, When GET /send, Then no message sent, returns 500', async () => {
      // Given
      mockRedisSet.mockRejectedValue(new Error('Redis down'));

      // When
      const res = await request(app).get('/send');

      // Then
      expect(res.status).toBe(500);
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  describe('AC7: Missing env vars prevent start', () => {
    it('Given LINE_CHANNEL_ACCESS_TOKEN is missing, When server starts, Then exits', () => {
      jest.resetModules();
      delete process.env.LINE_CHANNEL_ACCESS_TOKEN;

      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('exit');
      });
      const mockError = jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => require('../index')).toThrow('exit');
      expect(mockError).toHaveBeenCalledWith(
        expect.stringContaining('LINE_CHANNEL_ACCESS_TOKEN')
      );

      mockExit.mockRestore();
      mockError.mockRestore();
    });
  });
});
```

**Commit:** "Add BDD integration tests for Slice 1 (S1-AC1 through AC7)"

---

## Slice 2: User receives exactly one message per day

### Task 2.1: Duplicate prevention and timezone handling

**Traces to:** S2-AC1, S2-AC2, S2-AC3, S2-AC4, S2-AC5
**Assumes:** A4 — Upstash supports SET NX EX
**Files:**
- Update: `src/__tests__/send.test.js` (add duplicate tests)
- Logic already implemented in Task 1.4 — this task adds tests

**Note:** The SET NX logic is already in the /send handler from Task 1.4. This task focuses on testing the duplicate prevention behavior and timezone correctness.

**Steps:**

1. **Write tests:**

```javascript
// Add to src/__tests__/send.test.js

describe('Duplicate prevention (Slice 2)', () => {
  let app;
  let mockRedisSet;
  let mockRedisIncr;
  let mockPush;

  beforeEach(() => {
    jest.resetModules();
    process.env.LINE_CHANNEL_ACCESS_TOKEN = 'test-token';
    process.env.LINE_CHANNEL_SECRET = 'test-secret';
    process.env.LINE_USER_ID = 'U1234567890abcdef1234567890abcdef';
    process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test';

    mockRedisSet = jest.fn();
    mockRedisIncr = jest.fn();
    mockPush = jest.fn().mockResolvedValue({});

    jest.mock('@upstash/redis', () => ({
      Redis: jest.fn(() => ({
        set: mockRedisSet,
        incr: mockRedisIncr,
      })),
    }));

    jest.mock('@line/bot-sdk', () => ({
      messagingApi: {
        MessagingApiClient: jest.fn(() => ({ pushMessage: mockPush })),
      },
      middleware: jest.fn(() => (req, res, next) => next()),
    }));

    app = require('../index');
  });

  test('S2-AC1: blocks duplicate request on same day', async () => {
    mockRedisSet.mockResolvedValue(null); // SET NX returns null = key exists

    const res = await request(app).get('/send');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sent: false, reason: 'already_sent' });
    expect(mockPush).not.toHaveBeenCalled();
  });

  test('S2-AC2: allows sending on new day', async () => {
    mockRedisSet.mockResolvedValue('OK'); // SET NX succeeds = new day
    mockRedisIncr.mockResolvedValue(2);

    const res = await request(app).get('/send');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sent: true, dayCount: 2 });
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  test('S2-AC4: SET NX uses 48-hour expiry', async () => {
    mockRedisSet.mockResolvedValue('OK');
    mockRedisIncr.mockResolvedValue(1);

    await request(app).get('/send');

    expect(mockRedisSet).toHaveBeenCalledWith(
      expect.stringMatching(/^sent:\d{4}-\d{2}-\d{2}$/),
      '1',
      { nx: true, ex: 172800 }
    );
  });

  test('S2-AC5: date key uses Asia/Taipei timezone, not UTC', async () => {
    // Given: 2026-02-16 15:30 UTC = 2026-02-16 23:30 Taipei (same day)
    // But:   2026-02-16 16:00 UTC = 2026-02-17 00:00 Taipei (next day!)
    const realDate = Date;
    // Set clock to 2026-02-16T16:00:00Z = 2026-02-17 00:00 Taipei
    global.Date = class extends realDate {
      constructor(...args) {
        if (args.length === 0) return new realDate('2026-02-16T16:00:00Z');
        return new realDate(...args);
      }
      static now() { return new realDate('2026-02-16T16:00:00Z').getTime(); }
    };
    global.Date.prototype = realDate.prototype;

    mockRedisSet.mockResolvedValue('OK');
    mockRedisIncr.mockResolvedValue(1);

    await request(app).get('/send');

    // Key should be Taipei date (Feb 17), NOT UTC date (Feb 16)
    const key = mockRedisSet.mock.calls[0][0];
    expect(key).toBe('sent:2026-02-17');

    global.Date = realDate;
  });
});
```

2. **Verify tests pass** (logic already implemented in Task 1.4).

3. **Commit:** "Add duplicate prevention tests (S2-AC1 through AC5)"

---

### Task 2.2: BDD Integration Test — Slice 2

**Traces to:** S2-AC1 through S2-AC5
**Type:** BDD
**Files:**
- Create: `src/__tests__/slice2.bdd.test.js`

**Complete test code:**

```javascript
// src/__tests__/slice2.bdd.test.js
const request = require('supertest');

describe('Slice 2: User receives exactly one message per day', () => {
  let app;
  let mockRedisSet;
  let mockRedisIncr;
  let mockPush;

  beforeEach(() => {
    jest.resetModules();
    process.env.LINE_CHANNEL_ACCESS_TOKEN = 'test-token';
    process.env.LINE_CHANNEL_SECRET = 'test-secret';
    process.env.LINE_USER_ID = 'U1234567890abcdef1234567890abcdef';
    process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test';

    mockRedisSet = jest.fn();
    mockRedisIncr = jest.fn();
    mockPush = jest.fn().mockResolvedValue({});

    jest.mock('@upstash/redis', () => ({
      Redis: jest.fn(() => ({
        set: mockRedisSet,
        incr: mockRedisIncr,
      })),
    }));

    jest.mock('@line/bot-sdk', () => ({
      messagingApi: {
        MessagingApiClient: jest.fn(() => ({ pushMessage: mockPush })),
      },
      middleware: jest.fn(() => (req, res, next) => next()),
    }));

    app = require('../index');
  });

  describe('AC1: Duplicate request on same day is blocked', () => {
    it('Given message already sent today, When GET /send again, Then no message sent', async () => {
      // Given: sent:<today> key already exists
      mockRedisSet.mockResolvedValue(null);

      // When
      const res = await request(app).get('/send');

      // Then
      expect(res.body).toEqual({ sent: false, reason: 'already_sent' });
      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  describe('AC2: New day allows sending again', () => {
    it('Given yesterday was sent but today is new, When GET /send, Then message sent', async () => {
      // Given: today's key doesn't exist (SET NX succeeds)
      mockRedisSet.mockResolvedValue('OK');
      mockRedisIncr.mockResolvedValue(5);

      // When
      const res = await request(app).get('/send');

      // Then
      expect(res.body).toEqual({ sent: true, dayCount: 5 });
      expect(mockPush).toHaveBeenCalledTimes(1);
    });
  });

  describe('AC3: Duplicate prevention is atomic', () => {
    it('Given today key does not exist, When two requests race, Then only one succeeds', async () => {
      // Given: first SET NX succeeds, second returns null (atomic)
      mockRedisSet
        .mockResolvedValueOnce('OK')   // First request wins
        .mockResolvedValueOnce(null);   // Second request blocked
      mockRedisIncr.mockResolvedValue(1);

      // When: two simultaneous requests
      const [res1, res2] = await Promise.all([
        request(app).get('/send'),
        request(app).get('/send'),
      ]);

      // Then: exactly one sent
      const results = [res1.body, res2.body];
      const sent = results.filter((r) => r.sent === true);
      const skipped = results.filter((r) => r.reason === 'already_sent');
      expect(sent).toHaveLength(1);
      expect(skipped).toHaveLength(1);
      expect(mockPush).toHaveBeenCalledTimes(1);
    });
  });

  describe('AC4: Sent keys auto-expire', () => {
    it('Given SET NX is called, Then expiry is 172800 seconds (48 hours)', async () => {
      // Given & When
      mockRedisSet.mockResolvedValue('OK');
      mockRedisIncr.mockResolvedValue(1);
      await request(app).get('/send');

      // Then
      expect(mockRedisSet).toHaveBeenCalledWith(
        expect.any(String),
        '1',
        { nx: true, ex: 172800 }
      );
    });
  });

  describe('AC5: Date computed in Asia/Taipei timezone', () => {
    it('Given UTC time past Taipei midnight, When computing date, Then uses Taipei date', async () => {
      // Given: 2026-02-16T16:00:00Z = 2026-02-17 00:00 Taipei
      const realDate = Date;
      global.Date = class extends realDate {
        constructor(...args) {
          if (args.length === 0) return new realDate('2026-02-16T16:00:00Z');
          return new realDate(...args);
        }
        static now() { return new realDate('2026-02-16T16:00:00Z').getTime(); }
      };
      global.Date.prototype = realDate.prototype;

      mockRedisSet.mockResolvedValue('OK');
      mockRedisIncr.mockResolvedValue(1);

      // When
      await request(app).get('/send');

      // Then: key uses Taipei date (Feb 17), not UTC date (Feb 16)
      const key = mockRedisSet.mock.calls[0][0];
      expect(key).toBe('sent:2026-02-17');

      global.Date = realDate;
    });
  });
});
```

**Commit:** "Add BDD integration tests for Slice 2 (S2-AC1 through AC5)"

---

## Slice 4: Server validates webhook signatures

### Task 4.1: Webhook endpoint with signature validation

**Traces to:** S4-AC1, S4-AC2, S4-AC3
**Assumes:** A3 — @line/bot-sdk middleware validates X-Line-Signature
**Tools:** Context7 (@line/bot-sdk middleware)
**Files:**
- Update: `src/index.js` (add /webhook route with middleware)
- Create: `src/__tests__/webhook.test.js`

**Steps:**

1. **Write failing tests:**

```javascript
// src/__tests__/webhook.test.js
const request = require('supertest');
const crypto = require('crypto');

describe('POST /webhook (Slice 4)', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();
    process.env.LINE_CHANNEL_ACCESS_TOKEN = 'test-token';
    process.env.LINE_CHANNEL_SECRET = 'test-secret';
    process.env.LINE_USER_ID = 'U1234567890abcdef1234567890abcdef';
    process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test';
  });

  describe('With real signature validation', () => {
    beforeEach(() => {
      jest.mock('@upstash/redis', () => ({
        Redis: jest.fn(() => ({ set: jest.fn(), incr: jest.fn() })),
      }));

      jest.mock('@line/bot-sdk', () => {
        const actual = jest.requireActual('@line/bot-sdk');
        return {
          messagingApi: {
            MessagingApiClient: jest.fn(() => ({ pushMessage: jest.fn() })),
          },
          middleware: actual.middleware,
        };
      });

      app = require('../index');
    });

    test('S4-AC1: valid signature returns 200', async () => {
      const body = JSON.stringify({ events: [] });
      const signature = crypto
        .createHmac('SHA256', 'test-secret')
        .update(body)
        .digest('base64');

      const res = await request(app)
        .post('/webhook')
        .set('Content-Type', 'application/json')
        .set('X-Line-Signature', signature)
        .send(body);

      expect(res.status).toBe(200);
    });

    test('S4-AC2: invalid signature returns 401', async () => {
      const res = await request(app)
        .post('/webhook')
        .set('Content-Type', 'application/json')
        .set('X-Line-Signature', 'invalid-signature')
        .send(JSON.stringify({ events: [] }));

      expect([401, 403]).toContain(res.status);
    });

    test('S4-AC3: missing signature returns 401', async () => {
      const res = await request(app)
        .post('/webhook')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ events: [] }));

      expect([401, 403]).toContain(res.status);
    });
  });
});
```

2. **Verify tests fail.**

3. **Implement** — add to `src/index.js`:

```javascript
const { middleware } = require('@line/bot-sdk');

const lineMiddleware = middleware({
  channelSecret: process.env.LINE_CHANNEL_SECRET,
});

app.post('/webhook', lineMiddleware, (req, res) => {
  res.sendStatus(200);
});
```

4. **Verify tests pass.**

5. **Commit:** "Add webhook endpoint with signature validation (S4-AC1 through AC3)"

---

### Task 4.2: BDD Integration Test — Slice 4

**Traces to:** S4-AC1 through S4-AC3
**Type:** BDD
**Files:**
- Create: `src/__tests__/slice4.bdd.test.js`

**Complete test code:**

```javascript
// src/__tests__/slice4.bdd.test.js
const request = require('supertest');
const crypto = require('crypto');

describe('Slice 4: Server validates webhook signatures', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();
    process.env.LINE_CHANNEL_ACCESS_TOKEN = 'test-token';
    process.env.LINE_CHANNEL_SECRET = 'test-webhook-secret';
    process.env.LINE_USER_ID = 'U1234567890abcdef1234567890abcdef';
    process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'test';

    jest.mock('@upstash/redis', () => ({
      Redis: jest.fn(() => ({ set: jest.fn(), incr: jest.fn() })),
    }));

    jest.mock('@line/bot-sdk', () => {
      const actual = jest.requireActual('@line/bot-sdk');
      return {
        messagingApi: {
          MessagingApiClient: jest.fn(() => ({ pushMessage: jest.fn() })),
        },
        middleware: actual.middleware,
      };
    });

    app = require('../index');
  });

  describe('AC1: Valid LINE webhook is accepted', () => {
    it('Given valid channel secret, When LINE sends POST with valid signature, Then returns 200', async () => {
      // Given: server running with LINE_CHANNEL_SECRET
      const body = JSON.stringify({ events: [], destination: 'U1234' });
      const signature = crypto
        .createHmac('SHA256', 'test-webhook-secret')
        .update(body)
        .digest('base64');

      // When
      const res = await request(app)
        .post('/webhook')
        .set('Content-Type', 'application/json')
        .set('X-Line-Signature', signature)
        .send(body);

      // Then
      expect(res.status).toBe(200);
    });
  });

  describe('AC2: Invalid webhook signature is rejected', () => {
    it('Given valid server, When POST with wrong signature, Then returns 401/403', async () => {
      // When
      const res = await request(app)
        .post('/webhook')
        .set('Content-Type', 'application/json')
        .set('X-Line-Signature', 'totally-wrong-signature')
        .send(JSON.stringify({ events: [] }));

      // Then
      expect([401, 403]).toContain(res.status);
    });
  });

  describe('AC3: Webhook without signature is rejected', () => {
    it('Given valid server, When POST without X-Line-Signature, Then returns 401/403', async () => {
      // When
      const res = await request(app)
        .post('/webhook')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ events: [] }));

      // Then
      expect([401, 403]).toContain(res.status);
    });
  });
});
```

**Commit:** "Add BDD integration tests for Slice 4 (S4-AC1 through AC3)"

---

## Slice 3: Message arrives automatically at lunchtime

### Task 3.1: GitHub Actions workflow file

**Traces to:** S3-AC1, S3-AC2, S3-AC3, S3-AC4
**Files:**
- Create: `.github/workflows/daily-reminder.yml`

**Note:** This slice is infrastructure (YAML config), not application code. Tests are manual verification via `workflow_dispatch`.

**Steps:**

1. **Create the workflow file:**

```yaml
# .github/workflows/daily-reminder.yml
name: Daily Reminder

on:
  schedule:
    - cron: '0 4 * * *'  # 4 AM UTC = 12 PM Asia/Taipei
  workflow_dispatch: {}    # Manual trigger for testing

jobs:
  send:
    runs-on: ubuntu-latest
    timeout-minutes: 2     # Handles Render cold start (30-90s)
    steps:
      - name: Trigger daily message
        run: |
          response=$(curl -s -w "\n%{http_code}" \
            --connect-timeout 30 \
            --max-time 90 \
            "${{ secrets.RENDER_URL }}/send")
          http_code=$(echo "$response" | tail -1)
          body=$(echo "$response" | sed '$d')
          echo "Status: $http_code"
          echo "Response: $body"
          if [ "$http_code" != "200" ]; then
            echo "::error::Failed to send daily message (HTTP $http_code)"
            exit 1
          fi
```

2. **Verify:** YAML is valid, cron expression is correct (0 4 * * * = 4 AM UTC = 12 PM Taipei).

3. **Manual verification plan** (after deployment):
   - Trigger workflow manually via GitHub Actions UI (S3-AC4)
   - Verify LINE message arrives (S3-AC4)
   - Check workflow logs for status output (S3-AC3)
   - Wait for next scheduled run to verify automatic trigger (S3-AC1)

4. **Commit:** "Add GitHub Actions daily cron workflow (S3-AC1 through AC4)"

---

## Dependency Graph

```
Slice 0: Scaffolding
  └── Task 0.1: project init + data files
        │
        ▼
Slice 1: Core Message          Slice 4: Webhook
  ├── Task 1.1: env validation   ├── Task 4.1: webhook + sig validation
  ├── Task 1.2: formatting       └── Task 4.2: BDD test (Slice 4)
  ├── Task 1.3: LINE push
  ├── Task 1.4: /send endpoint
  └── Task 1.5: BDD test (Slice 1)
        │
        ▼
Slice 2: Duplicate Prevention
  ├── Task 2.1: duplicate tests (logic from 1.4)
  └── Task 2.2: BDD test (Slice 2)
        │
        ▼
Slice 3: Automation
  └── Task 3.1: GitHub Actions workflow

Parallel: Slice 1 ∥ Slice 4 (independent)
Sequential: Slice 0 → Slice 1 → Slice 2 → Slice 3
```

## Summary Statistics

| Slice | Tasks | Tests | New Files | Modified Files |
|-------|-------|-------|-----------|----------------|
| 0. Scaffolding | 1 | 0 | 4 | 2 |
| 1. Core Message | 5 | ~12 | 3 | 1 |
| 2. Duplicate Prevention | 2 | ~7 | 1 | 1 |
| 4. Webhook Validation | 2 | ~3 | 2 | 1 |
| 3. Automation | 1 | 0 | 1 | 0 |
| **Total** | **11** | **~23** | **11** | **5** |

---

## Review Log

### Round 1 (ISSUES_FOUND)
- Fixed: [CRITICAL] `app.listen()` at module level → added `if (require.main === module)` guard for Supertest compatibility
- Fixed: [IMPORTANT] Task 1.4 file list said `index.test.js` but code used `send.test.js` → corrected to `Create: src/__tests__/send.test.js`
- Fixed: [IMPORTANT] S2-AC5 timezone test only checked format regex → now mocks Date to verify Taipei date differs from UTC date at midnight boundary
- Fixed: [IMPORTANT] S1-AC4 (retry success) missing from Slice 1 BDD test → added AC4 test case
- Fixed: [IMPORTANT] `@line/bot-sdk` pinned to ^9.0.0 → updated to ^10.0.0 (latest stable, same API)
- Deferred: [MINOR] Log output assertions (SENT/SKIPPED/ERROR) — user chose to skip for v1
- Deferred: [MINOR] Real 1-second delay in retry tests — user chose to keep real timers for simplicity

### Round 2 (ISSUES_FOUND)
- Fixed: [IMPORTANT] `.env.example` update in Task 0.1 → added note to update local `.env` with missing vars
- Fixed: [IMPORTANT] `curl -sf` in GitHub Actions → removed `-f` flag to allow manual HTTP status check and descriptive error message (matches design doc)
- Fixed: [MINOR] `.gitignore` stale `data/state.json` → added removal instruction to Task 0.1 step 5
- Verified correct: @line/bot-sdk v10 API, @upstash/redis SET NX syntax, Date mock for timezone, module.exports pattern, dependency graph, coverage matrix (all 18 ACs covered)

### Round 3 (APPROVED)
- Fixed: [COSMETIC] Task 1.3 referenced "v9" → updated to "v10"
- Fixed: [COSMETIC] Coverage matrix S2-AC3 pointed to Task 2.1 → corrected to Task 2.2
- Plan approved. All substantive issues resolved. Reviewer verified: SDK APIs correct, test strategy sound, timezone handling correct, no over-engineering, all 18 ACs covered.
