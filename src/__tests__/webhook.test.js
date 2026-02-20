// Prevent dotenv from reading .env file during tests
jest.mock('dotenv', () => ({ config: jest.fn() }));

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
