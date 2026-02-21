// Prevent dotenv from reading .env file during tests
jest.mock('dotenv', () => ({ config: jest.fn() }));

const request = require('supertest');

let app;
let mockRedisSet;
let mockRedisIncr;
let mockRedisGet;
let mockPush;

beforeEach(() => {
  jest.resetModules();
  process.env.LINE_CHANNEL_ACCESS_TOKEN = 'test-token';
  process.env.LINE_CHANNEL_SECRET = 'test-secret';
  process.env.LINE_USER_IDS = 'U1234567890abcdef1234567890abcdef';
  process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'test';

  mockRedisSet = jest.fn();
  mockRedisIncr = jest.fn();
  mockRedisGet = jest.fn();
  mockPush = jest.fn().mockResolvedValue({});

  jest.mock('@upstash/redis', () => ({
    Redis: jest.fn(() => ({
      set: mockRedisSet,
      incr: mockRedisIncr,
      get: mockRedisGet,
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

describe('GET /', () => {
  test('returns 200', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
  });
});

describe('GET /send', () => {
  test('S1-AC1: sends message and returns { sent: true, dayCount }', async () => {
    mockRedisSet.mockResolvedValue('OK'); // SET NX succeeded
    mockRedisIncr.mockResolvedValue(1);   // dayCount = 1

    const res = await request(app).get('/send');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sent: true, dayCount: 1, preview: false });
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

describe('Duplicate prevention (Slice 2)', () => {
  test('S2-AC1: blocks duplicate request on same day', async () => {
    mockRedisSet.mockResolvedValue(null); // SET NX returns null = key exists

    const res = await request(app).get('/send');

    expect(res.status).toBe(429);
    expect(res.body).toEqual({ sent: false, reason: 'already_sent' });
    expect(mockPush).not.toHaveBeenCalled();
  });

  test('S2-AC2: allows sending on new day', async () => {
    mockRedisSet.mockResolvedValue('OK'); // SET NX succeeds = new day
    mockRedisIncr.mockResolvedValue(2);

    const res = await request(app).get('/send');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sent: true, dayCount: 2, preview: false });
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

describe('Force mode (manual trigger)', () => {
  test('force=true sends message and returns preview: true', async () => {
    mockRedisGet.mockResolvedValue('5'); // dayCount is currently 5

    const res = await request(app).get('/send?force=true');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sent: true, dayCount: 6, preview: true });
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  test('force=true does not call redis.set or redis.incr', async () => {
    mockRedisGet.mockResolvedValue('3');

    await request(app).get('/send?force=true');

    expect(mockRedisSet).not.toHaveBeenCalled();
    expect(mockRedisIncr).not.toHaveBeenCalled();
    expect(mockRedisGet).toHaveBeenCalledWith('dayCount');
  });

  test('force=true with null dayCount (first-ever run) produces dayCount 1', async () => {
    mockRedisGet.mockResolvedValue(null);

    const res = await request(app).get('/send?force=true');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sent: true, dayCount: 1, preview: true });
  });
});
