// Prevent dotenv from reading .env file during tests
jest.mock('dotenv', () => ({ config: jest.fn() }));

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
