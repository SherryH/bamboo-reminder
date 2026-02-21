// Prevent dotenv from reading .env file during tests
jest.mock('dotenv', () => ({ config: jest.fn() }));

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
    process.env.LINE_USER_IDS = 'U1234567890abcdef1234567890abcdef';
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
      expect(res.body).toEqual({ sent: true, dayCount: 1, preview: false });
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
