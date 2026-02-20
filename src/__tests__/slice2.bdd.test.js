// Prevent dotenv from reading .env file during tests
jest.mock('dotenv', () => ({ config: jest.fn() }));

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
