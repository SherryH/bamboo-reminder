// Prevent dotenv from reading .env file during tests
jest.mock('dotenv', () => ({ config: jest.fn() }));

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

const quotes = require('../../data/quotes.json');
const deeds = require('../../data/deeds.json');

describe('formatMessage', () => {
  let formatMessage;

  beforeAll(() => {
    jest.resetModules();
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
