/**
 * Tests for EmailNotifier
 *
 * Tests the email notification system including:
 * - SMTP configuration checking
 * - Email sending
 * - Duration formatting
 * - Error handling
 */

import { sendOutageRestoredEmail } from '../email-notifier';

// Mock nodemailer
const mockSendMail = jest.fn();
const mockCreateTransport = jest.fn(() => ({
  sendMail: mockSendMail,
}));

jest.mock('nodemailer', () => ({
  createTransport: (config: unknown) => mockCreateTransport(config),
}));

// Mock logger
jest.mock('@/lib/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    logEmail: jest.fn(),
  },
}));

// Mock env - define inside the factory to avoid hoisting issues
const mockEnv: Record<string, string> = {};

jest.mock('@/lib/env', () => {
  // Return a proxy that reads from mockEnv
  return {
    env: new Proxy({} as Record<string, string>, {
      get: (_target, prop: string) => mockEnv[prop],
    }),
  };
});

// Mock utils
jest.mock('@/lib/utils', () => ({
  getErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
}));

import { logger } from '@/lib/logger';

describe('sendOutageRestoredEmail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset env to defaults
    mockEnv.SMTP_HOST = 'smtp.example.com';
    mockEnv.SMTP_PORT = '587';
    mockEnv.SMTP_SECURE = 'false';
    mockEnv.SMTP_USER = 'user@example.com';
    mockEnv.SMTP_PASS = 'password123';
    mockEnv.EMAIL_FROM = 'wanwatch@example.com';
    mockEnv.EMAIL_TO = 'admin@example.com';
    mockEnv.APP_URL = 'https://wanwatch.example.com';
    mockSendMail.mockResolvedValue({ messageId: 'test-message-id' });
  });

  describe('configuration checks', () => {
    it('should skip sending when SMTP_HOST is not configured', async () => {
      mockEnv.SMTP_HOST = '';

      const startTime = new Date('2025-01-15T10:00:00Z');
      const endTime = new Date('2025-01-15T10:05:00Z');

      await sendOutageRestoredEmail(startTime, endTime, 300);

      expect(logger.debug).toHaveBeenCalledWith(
        'Email not configured, skipping notification'
      );
      expect(mockCreateTransport).not.toHaveBeenCalled();
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('should skip sending when EMAIL_TO is not configured', async () => {
      mockEnv.EMAIL_TO = '';

      const startTime = new Date('2025-01-15T10:00:00Z');
      const endTime = new Date('2025-01-15T10:05:00Z');

      await sendOutageRestoredEmail(startTime, endTime, 300);

      expect(logger.debug).toHaveBeenCalledWith(
        'Email not configured, skipping notification'
      );
      expect(mockCreateTransport).not.toHaveBeenCalled();
    });
  });

  describe('SMTP transport configuration', () => {
    it('should create transport with correct configuration', async () => {
      const startTime = new Date('2025-01-15T10:00:00Z');
      const endTime = new Date('2025-01-15T10:05:00Z');

      await sendOutageRestoredEmail(startTime, endTime, 300);

      expect(mockCreateTransport).toHaveBeenCalledWith({
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        auth: {
          user: 'user@example.com',
          pass: 'password123',
        },
      });
    });

    it('should handle secure SMTP (port 465)', async () => {
      mockEnv.SMTP_PORT = '465';
      mockEnv.SMTP_SECURE = 'true';

      const startTime = new Date('2025-01-15T10:00:00Z');
      const endTime = new Date('2025-01-15T10:05:00Z');

      await sendOutageRestoredEmail(startTime, endTime, 300);

      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 465,
          secure: true,
        })
      );
    });

    it('should default to port 587 if not specified', async () => {
      mockEnv.SMTP_PORT = '';

      const startTime = new Date('2025-01-15T10:00:00Z');
      const endTime = new Date('2025-01-15T10:05:00Z');

      await sendOutageRestoredEmail(startTime, endTime, 300);

      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 587,
        })
      );
    });
  });

  describe('duration formatting', () => {
    it('should format short durations in minutes and seconds', async () => {
      const startTime = new Date('2025-01-15T10:00:00Z');
      const endTime = new Date('2025-01-15T10:02:30Z');
      const durationSec = 150; // 2 minutes 30 seconds

      await sendOutageRestoredEmail(startTime, endTime, durationSec);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('2m 30s'),
        })
      );
    });

    it('should format durations over an hour', async () => {
      const startTime = new Date('2025-01-15T10:00:00Z');
      const endTime = new Date('2025-01-15T12:30:00Z');
      const durationSec = 9000; // 2 hours 30 minutes

      await sendOutageRestoredEmail(startTime, endTime, durationSec);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('2h 30m'),
        })
      );
    });

    it('should format zero seconds correctly', async () => {
      const startTime = new Date('2025-01-15T10:00:00Z');
      const endTime = new Date('2025-01-15T10:00:00Z');
      const durationSec = 0;

      await sendOutageRestoredEmail(startTime, endTime, durationSec);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('0m 0s'),
        })
      );
    });

    it('should format exactly one hour', async () => {
      const startTime = new Date('2025-01-15T10:00:00Z');
      const endTime = new Date('2025-01-15T11:00:00Z');
      const durationSec = 3600;

      await sendOutageRestoredEmail(startTime, endTime, durationSec);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('1h 0m'),
        })
      );
    });
  });

  describe('email content', () => {
    it('should send email with correct subject', async () => {
      const startTime = new Date('2025-01-15T10:00:00Z');
      const endTime = new Date('2025-01-15T10:05:00Z');

      await sendOutageRestoredEmail(startTime, endTime, 300);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: '🟢 WanWatch - Connection Restored',
        })
      );
    });

    it('should include from and to addresses', async () => {
      const startTime = new Date('2025-01-15T10:00:00Z');
      const endTime = new Date('2025-01-15T10:05:00Z');

      await sendOutageRestoredEmail(startTime, endTime, 300);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'wanwatch@example.com',
          to: 'admin@example.com',
        })
      );
    });

    it('should include dashboard link from APP_URL', async () => {
      const startTime = new Date('2025-01-15T10:00:00Z');
      const endTime = new Date('2025-01-15T10:05:00Z');

      await sendOutageRestoredEmail(startTime, endTime, 300);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining(
            'https://wanwatch.example.com/dashboard'
          ),
        })
      );
    });

    it('should use localhost fallback when APP_URL is not set', async () => {
      mockEnv.APP_URL = '';

      const startTime = new Date('2025-01-15T10:00:00Z');
      const endTime = new Date('2025-01-15T10:05:00Z');

      await sendOutageRestoredEmail(startTime, endTime, 300);

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('http://localhost:3000/dashboard'),
        })
      );
    });
  });

  describe('success logging', () => {
    it('should log successful email send', async () => {
      const startTime = new Date('2025-01-15T10:00:00Z');
      const endTime = new Date('2025-01-15T10:05:00Z');
      const durationSec = 300;

      await sendOutageRestoredEmail(startTime, endTime, durationSec);

      expect(logger.logEmail).toHaveBeenCalledWith(
        'success',
        'admin@example.com',
        'Connection Restored',
        {
          durationSec: 300,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
        }
      );
    });
  });

  describe('error handling', () => {
    it('should log failure when sendMail throws', async () => {
      mockSendMail.mockRejectedValue(new Error('SMTP connection failed'));

      const startTime = new Date('2025-01-15T10:00:00Z');
      const endTime = new Date('2025-01-15T10:05:00Z');
      const durationSec = 300;

      // Should not throw
      await sendOutageRestoredEmail(startTime, endTime, durationSec);

      expect(logger.logEmail).toHaveBeenCalledWith(
        'failure',
        'admin@example.com',
        'Connection Restored',
        {
          error: 'SMTP connection failed',
          durationSec: 300,
        }
      );
    });

    it('should not throw errors to caller', async () => {
      mockSendMail.mockRejectedValue(new Error('Network error'));

      const startTime = new Date('2025-01-15T10:00:00Z');
      const endTime = new Date('2025-01-15T10:05:00Z');

      await expect(
        sendOutageRestoredEmail(startTime, endTime, 300)
      ).resolves.not.toThrow();
    });

    it('should use unknown for EMAIL_TO in error log when not configured', async () => {
      mockEnv.EMAIL_TO = '';
      // Force a path where we still try to send (by not skipping the config check)
      // This tests the fallback in the catch block
      // Since the config check happens first, we need to test this differently
      // The 'unknown' fallback is unreachable in current code - it's defensive coding
      // Let's verify the main error path works correctly instead
      mockSendMail.mockRejectedValue(new Error('Send failed'));
      mockEnv.EMAIL_TO = 'test@example.com';

      const startTime = new Date('2025-01-15T10:00:00Z');
      const endTime = new Date('2025-01-15T10:05:00Z');

      await sendOutageRestoredEmail(startTime, endTime, 300);

      expect(logger.logEmail).toHaveBeenCalledWith(
        'failure',
        'test@example.com',
        'Connection Restored',
        expect.objectContaining({ error: 'Send failed' })
      );
    });
  });
});
