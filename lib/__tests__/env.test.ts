/**
 * Tests for environment variable validation
 *
 * Note: The env.ts module calls process.exit() on validation failure,
 * which makes testing tricky. We test the zod schema validation directly
 * rather than the validateEnv function.
 */

import { z } from 'zod';

// Create a test version of the schema from lib/env.ts
const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // NextAuth
  NEXTAUTH_SECRET: z.string().min(32, 'NEXTAUTH_SECRET must be at least 32 characters'),
  NEXTAUTH_URL: z.string().url('NEXTAUTH_URL must be a valid URL'),
  AUTH_TRUST_HOST: z.enum(['true', 'false']).optional(),

  // Initial Admin User (optional - for auto-creation)
  INITIAL_ADMIN_EMAIL: z.string().email().optional(),
  INITIAL_ADMIN_PASSWORD: z.string().optional(),
  INITIAL_ADMIN_NAME: z.string().optional(),

  // Email Configuration (optional)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().regex(/^\d+$/).optional(),
  SMTP_SECURE: z.enum(['true', 'false']).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  EMAIL_TO: z.string().email().optional(),

  // App Configuration
  APP_URL: z.string().url().optional(),
  CHECK_INTERVAL_SECONDS: z.string().regex(/^\d+$/).default('300'),
  OUTAGE_CHECK_INTERVAL_SECONDS: z.string().regex(/^\d+$/).default('30'),
  ENABLE_MONITORING: z.enum(['true', 'false']).default('false'),
  NETWORK_INFO_CACHE_SECONDS: z.string().regex(/^\d+$/).optional(),

  // Speed Test Configuration
  ENABLE_SPEED_TEST: z.enum(['true', 'false']).default('false'),
  SPEED_TEST_INTERVAL_SECONDS: z.string().regex(/^\d+$/).default('1800'),

  // Docker Configuration (optional)
  TZ: z.string().optional(),
  PUID: z.string().regex(/^\d+$/).optional(),
  PGID: z.string().regex(/^\d+$/).optional(),

  // Node Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

describe('Environment Validation', () => {
  // Helper to create valid base env
  const createValidEnv = () => ({
    DATABASE_URL: 'file:./test.db',
    NEXTAUTH_SECRET: 'test-secret-key-minimum-32-characters-long',
    NEXTAUTH_URL: 'http://localhost:3000',
    NODE_ENV: 'test' as const,
  });

  describe('Required Variables', () => {
    it('should throw error when DATABASE_URL is missing', () => {
      const env = { ...createValidEnv() };
      delete (env as any).DATABASE_URL;

      expect(() => envSchema.parse(env)).toThrow();
    });

    it('should throw error when DATABASE_URL is empty string', () => {
      const env = { ...createValidEnv(), DATABASE_URL: '' };

      expect(() => envSchema.parse(env)).toThrow('DATABASE_URL is required');
    });

    it('should accept valid DATABASE_URL', () => {
      const env = { ...createValidEnv(), DATABASE_URL: 'file:./wanwatch.db' };

      const result = envSchema.parse(env);
      expect(result.DATABASE_URL).toBe('file:./wanwatch.db');
    });

    it('should throw error when NEXTAUTH_SECRET is missing', () => {
      const env = { ...createValidEnv() };
      delete (env as any).NEXTAUTH_SECRET;

      expect(() => envSchema.parse(env)).toThrow();
    });

    it('should throw error when NEXTAUTH_SECRET is too short', () => {
      const env = { ...createValidEnv(), NEXTAUTH_SECRET: 'short-key' };

      expect(() => envSchema.parse(env)).toThrow('at least 32 characters');
    });

    it('should accept NEXTAUTH_SECRET with exactly 32 characters', () => {
      const env = { ...createValidEnv(), NEXTAUTH_SECRET: '12345678901234567890123456789012' };

      const result = envSchema.parse(env);
      expect(result.NEXTAUTH_SECRET).toHaveLength(32);
    });

    it('should accept NEXTAUTH_SECRET with more than 32 characters', () => {
      const env = { ...createValidEnv(), NEXTAUTH_SECRET: '1234567890123456789012345678901234567890' };

      const result = envSchema.parse(env);
      expect(result.NEXTAUTH_SECRET).toHaveLength(40);
    });

    it('should throw error when NEXTAUTH_URL is missing', () => {
      const env = { ...createValidEnv() };
      delete (env as any).NEXTAUTH_URL;

      expect(() => envSchema.parse(env)).toThrow();
    });

    it('should throw error when NEXTAUTH_URL is not a valid URL', () => {
      const env = { ...createValidEnv(), NEXTAUTH_URL: 'not-a-url' };

      expect(() => envSchema.parse(env)).toThrow('valid URL');
    });

    it('should accept valid HTTP NEXTAUTH_URL', () => {
      const env = { ...createValidEnv(), NEXTAUTH_URL: 'http://localhost:3000' };

      const result = envSchema.parse(env);
      expect(result.NEXTAUTH_URL).toBe('http://localhost:3000');
    });

    it('should accept valid HTTPS NEXTAUTH_URL', () => {
      const env = { ...createValidEnv(), NEXTAUTH_URL: 'https://example.com' };

      const result = envSchema.parse(env);
      expect(result.NEXTAUTH_URL).toBe('https://example.com');
    });
  });

  describe('Optional Variables with Defaults', () => {
    it('should use default CHECK_INTERVAL_SECONDS when not provided', () => {
      const env = { ...createValidEnv() };

      const result = envSchema.parse(env);
      expect(result.CHECK_INTERVAL_SECONDS).toBe('300');
    });

    it('should throw error when CHECK_INTERVAL_SECONDS is not numeric', () => {
      const env = { ...createValidEnv(), CHECK_INTERVAL_SECONDS: 'not-a-number' };

      expect(() => envSchema.parse(env)).toThrow();
    });

    it('should accept valid numeric CHECK_INTERVAL_SECONDS', () => {
      const env = { ...createValidEnv(), CHECK_INTERVAL_SECONDS: '600' };

      const result = envSchema.parse(env);
      expect(result.CHECK_INTERVAL_SECONDS).toBe('600');
    });

    it('should use default OUTAGE_CHECK_INTERVAL_SECONDS when not provided', () => {
      const env = { ...createValidEnv() };

      const result = envSchema.parse(env);
      expect(result.OUTAGE_CHECK_INTERVAL_SECONDS).toBe('30');
    });

    it('should throw error when OUTAGE_CHECK_INTERVAL_SECONDS is not numeric', () => {
      const env = { ...createValidEnv(), OUTAGE_CHECK_INTERVAL_SECONDS: 'invalid' };

      expect(() => envSchema.parse(env)).toThrow();
    });

    it('should accept valid OUTAGE_CHECK_INTERVAL_SECONDS', () => {
      const env = { ...createValidEnv(), OUTAGE_CHECK_INTERVAL_SECONDS: '60' };

      const result = envSchema.parse(env);
      expect(result.OUTAGE_CHECK_INTERVAL_SECONDS).toBe('60');
    });

    it('should use default ENABLE_MONITORING when not provided', () => {
      const env = { ...createValidEnv() };

      const result = envSchema.parse(env);
      expect(result.ENABLE_MONITORING).toBe('false');
    });

    it('should throw error for invalid ENABLE_MONITORING value', () => {
      const env = { ...createValidEnv(), ENABLE_MONITORING: 'yes' as any };

      expect(() => envSchema.parse(env)).toThrow();
    });

    it('should accept "true" for ENABLE_MONITORING', () => {
      const env = { ...createValidEnv(), ENABLE_MONITORING: 'true' as const };

      const result = envSchema.parse(env);
      expect(result.ENABLE_MONITORING).toBe('true');
    });

    it('should accept "false" for ENABLE_MONITORING', () => {
      const env = { ...createValidEnv(), ENABLE_MONITORING: 'false' as const };

      const result = envSchema.parse(env);
      expect(result.ENABLE_MONITORING).toBe('false');
    });
  });

  describe('Email Configuration', () => {
    it('should allow missing SMTP_HOST (optional)', () => {
      const env = { ...createValidEnv() };

      const result = envSchema.parse(env);
      expect(result.SMTP_HOST).toBeUndefined();
    });

    it('should accept valid SMTP_HOST', () => {
      const env = { ...createValidEnv(), SMTP_HOST: 'smtp.gmail.com' };

      const result = envSchema.parse(env);
      expect(result.SMTP_HOST).toBe('smtp.gmail.com');
    });

    it('should throw error when SMTP_PORT is not numeric', () => {
      const env = { ...createValidEnv(), SMTP_PORT: 'not-a-number' };

      expect(() => envSchema.parse(env)).toThrow();
    });

    it('should accept valid SMTP_PORT', () => {
      const env = { ...createValidEnv(), SMTP_PORT: '587' };

      const result = envSchema.parse(env);
      expect(result.SMTP_PORT).toBe('587');
    });

    it('should throw error for invalid SMTP_SECURE value', () => {
      const env = { ...createValidEnv(), SMTP_SECURE: 'maybe' as any };

      expect(() => envSchema.parse(env)).toThrow();
    });

    it('should accept "true" for SMTP_SECURE', () => {
      const env = { ...createValidEnv(), SMTP_SECURE: 'true' as const };

      const result = envSchema.parse(env);
      expect(result.SMTP_SECURE).toBe('true');
    });

    it('should accept "false" for SMTP_SECURE', () => {
      const env = { ...createValidEnv(), SMTP_SECURE: 'false' as const };

      const result = envSchema.parse(env);
      expect(result.SMTP_SECURE).toBe('false');
    });

    it('should throw error when EMAIL_TO is not valid email', () => {
      const env = { ...createValidEnv(), EMAIL_TO: 'not-an-email' };

      expect(() => envSchema.parse(env)).toThrow();
    });

    it('should accept valid EMAIL_TO', () => {
      const env = { ...createValidEnv(), EMAIL_TO: 'user@example.com' };

      const result = envSchema.parse(env);
      expect(result.EMAIL_TO).toBe('user@example.com');
    });
  });

  describe('Initial Admin User Configuration', () => {
    it('should allow missing INITIAL_ADMIN_EMAIL (optional)', () => {
      const env = { ...createValidEnv() };

      const result = envSchema.parse(env);
      expect(result.INITIAL_ADMIN_EMAIL).toBeUndefined();
    });

    it('should throw error for invalid INITIAL_ADMIN_EMAIL format', () => {
      const env = { ...createValidEnv(), INITIAL_ADMIN_EMAIL: 'invalid-email' };

      expect(() => envSchema.parse(env)).toThrow();
    });

    it('should accept valid INITIAL_ADMIN_EMAIL', () => {
      const env = { ...createValidEnv(), INITIAL_ADMIN_EMAIL: 'admin@example.com' };

      const result = envSchema.parse(env);
      expect(result.INITIAL_ADMIN_EMAIL).toBe('admin@example.com');
    });

    it('should allow optional INITIAL_ADMIN_PASSWORD', () => {
      const env = { ...createValidEnv(), INITIAL_ADMIN_PASSWORD: 'secure-password' };

      const result = envSchema.parse(env);
      expect(result.INITIAL_ADMIN_PASSWORD).toBe('secure-password');
    });

    it('should allow optional INITIAL_ADMIN_NAME', () => {
      const env = { ...createValidEnv(), INITIAL_ADMIN_NAME: 'Admin User' };

      const result = envSchema.parse(env);
      expect(result.INITIAL_ADMIN_NAME).toBe('Admin User');
    });
  });

  describe('Speed Test Configuration', () => {
    it('should use default ENABLE_SPEED_TEST when not provided', () => {
      const env = { ...createValidEnv() };

      const result = envSchema.parse(env);
      expect(result.ENABLE_SPEED_TEST).toBe('false');
    });

    it('should throw error for invalid ENABLE_SPEED_TEST value', () => {
      const env = { ...createValidEnv(), ENABLE_SPEED_TEST: '1' as any };

      expect(() => envSchema.parse(env)).toThrow();
    });

    it('should accept "true" for ENABLE_SPEED_TEST', () => {
      const env = { ...createValidEnv(), ENABLE_SPEED_TEST: 'true' as const };

      const result = envSchema.parse(env);
      expect(result.ENABLE_SPEED_TEST).toBe('true');
    });

    it('should use default SPEED_TEST_INTERVAL_SECONDS when not provided', () => {
      const env = { ...createValidEnv() };

      const result = envSchema.parse(env);
      expect(result.SPEED_TEST_INTERVAL_SECONDS).toBe('1800');
    });

    it('should throw error when SPEED_TEST_INTERVAL_SECONDS is not numeric', () => {
      const env = { ...createValidEnv(), SPEED_TEST_INTERVAL_SECONDS: 'invalid' };

      expect(() => envSchema.parse(env)).toThrow();
    });

    it('should accept valid SPEED_TEST_INTERVAL_SECONDS', () => {
      const env = { ...createValidEnv(), SPEED_TEST_INTERVAL_SECONDS: '3600' };

      const result = envSchema.parse(env);
      expect(result.SPEED_TEST_INTERVAL_SECONDS).toBe('3600');
    });
  });

  describe('Docker Configuration', () => {
    it('should allow optional TZ variable', () => {
      const env = { ...createValidEnv(), TZ: 'America/New_York' };

      const result = envSchema.parse(env);
      expect(result.TZ).toBe('America/New_York');
    });

    it('should throw error when PUID is not numeric', () => {
      const env = { ...createValidEnv(), PUID: 'not-numeric' };

      expect(() => envSchema.parse(env)).toThrow();
    });

    it('should throw error when PGID is not numeric', () => {
      const env = { ...createValidEnv(), PGID: 'not-numeric' };

      expect(() => envSchema.parse(env)).toThrow();
    });

    it('should accept valid PUID', () => {
      const env = { ...createValidEnv(), PUID: '1026' };

      const result = envSchema.parse(env);
      expect(result.PUID).toBe('1026');
    });

    it('should accept valid PGID', () => {
      const env = { ...createValidEnv(), PGID: '100' };

      const result = envSchema.parse(env);
      expect(result.PGID).toBe('100');
    });

    it('should accept both PUID and PGID together', () => {
      const env = { ...createValidEnv(), PUID: '1026', PGID: '100' };

      const result = envSchema.parse(env);
      expect(result.PUID).toBe('1026');
      expect(result.PGID).toBe('100');
    });
  });

  describe('NODE_ENV', () => {
    it('should use default NODE_ENV when not provided', () => {
      const env = { ...createValidEnv() };
      delete (env as any).NODE_ENV;

      const result = envSchema.parse(env);
      expect(result.NODE_ENV).toBe('development');
    });

    it('should throw error for invalid NODE_ENV value', () => {
      const env = { ...createValidEnv(), NODE_ENV: 'staging' as any };

      expect(() => envSchema.parse(env)).toThrow();
    });

    it('should accept "development" as NODE_ENV', () => {
      const env = { ...createValidEnv(), NODE_ENV: 'development' as const };

      const result = envSchema.parse(env);
      expect(result.NODE_ENV).toBe('development');
    });

    it('should accept "production" as NODE_ENV', () => {
      const env = { ...createValidEnv(), NODE_ENV: 'production' as const };

      const result = envSchema.parse(env);
      expect(result.NODE_ENV).toBe('production');
    });

    it('should accept "test" as NODE_ENV', () => {
      const env = { ...createValidEnv(), NODE_ENV: 'test' as const };

      const result = envSchema.parse(env);
      expect(result.NODE_ENV).toBe('test');
    });
  });

  describe('APP_URL Configuration', () => {
    it('should allow missing APP_URL (optional)', () => {
      const env = { ...createValidEnv() };

      const result = envSchema.parse(env);
      expect(result.APP_URL).toBeUndefined();
    });

    it('should throw error when APP_URL is not a valid URL', () => {
      const env = { ...createValidEnv(), APP_URL: 'not-a-url' };

      expect(() => envSchema.parse(env)).toThrow();
    });

    it('should accept valid HTTP APP_URL', () => {
      const env = { ...createValidEnv(), APP_URL: 'http://example.com' };

      const result = envSchema.parse(env);
      expect(result.APP_URL).toBe('http://example.com');
    });

    it('should accept valid HTTPS APP_URL', () => {
      const env = { ...createValidEnv(), APP_URL: 'https://example.com' };

      const result = envSchema.parse(env);
      expect(result.APP_URL).toBe('https://example.com');
    });
  });

  describe('AUTH_TRUST_HOST Configuration', () => {
    it('should allow missing AUTH_TRUST_HOST (optional)', () => {
      const env = { ...createValidEnv() };

      const result = envSchema.parse(env);
      expect(result.AUTH_TRUST_HOST).toBeUndefined();
    });

    it('should throw error for invalid AUTH_TRUST_HOST value', () => {
      const env = { ...createValidEnv(), AUTH_TRUST_HOST: 'yes' as any };

      expect(() => envSchema.parse(env)).toThrow();
    });

    it('should accept "true" as AUTH_TRUST_HOST', () => {
      const env = { ...createValidEnv(), AUTH_TRUST_HOST: 'true' as const };

      const result = envSchema.parse(env);
      expect(result.AUTH_TRUST_HOST).toBe('true');
    });

    it('should accept "false" as AUTH_TRUST_HOST', () => {
      const env = { ...createValidEnv(), AUTH_TRUST_HOST: 'false' as const };

      const result = envSchema.parse(env);
      expect(result.AUTH_TRUST_HOST).toBe('false');
    });
  });

  describe('NETWORK_INFO_CACHE_SECONDS Configuration', () => {
    it('should allow missing NETWORK_INFO_CACHE_SECONDS (optional)', () => {
      const env = { ...createValidEnv() };

      const result = envSchema.parse(env);
      expect(result.NETWORK_INFO_CACHE_SECONDS).toBeUndefined();
    });

    it('should throw error when NETWORK_INFO_CACHE_SECONDS is not numeric', () => {
      const env = { ...createValidEnv(), NETWORK_INFO_CACHE_SECONDS: 'invalid' };

      expect(() => envSchema.parse(env)).toThrow();
    });

    it('should accept valid NETWORK_INFO_CACHE_SECONDS', () => {
      const env = { ...createValidEnv(), NETWORK_INFO_CACHE_SECONDS: '600' };

      const result = envSchema.parse(env);
      expect(result.NETWORK_INFO_CACHE_SECONDS).toBe('600');
    });
  });

  describe('Complete Valid Configuration', () => {
    it('should accept a complete valid configuration with all fields', () => {
      const env = {
        DATABASE_URL: 'file:./wanwatch.db',
        NEXTAUTH_SECRET: 'super-secret-key-that-is-definitely-32-characters-or-more',
        NEXTAUTH_URL: 'https://wanwatch.example.com',
        AUTH_TRUST_HOST: 'true' as const,
        INITIAL_ADMIN_EMAIL: 'admin@example.com',
        INITIAL_ADMIN_PASSWORD: 'secure-password',
        INITIAL_ADMIN_NAME: 'Admin User',
        SMTP_HOST: 'smtp.gmail.com',
        SMTP_PORT: '587',
        SMTP_SECURE: 'false' as const,
        SMTP_USER: 'user@gmail.com',
        SMTP_PASS: 'app-password',
        EMAIL_FROM: 'wanwatch@example.com',
        EMAIL_TO: 'admin@example.com',
        APP_URL: 'https://wanwatch.example.com',
        CHECK_INTERVAL_SECONDS: '300',
        OUTAGE_CHECK_INTERVAL_SECONDS: '30',
        ENABLE_MONITORING: 'true' as const,
        NETWORK_INFO_CACHE_SECONDS: '600',
        ENABLE_SPEED_TEST: 'true' as const,
        SPEED_TEST_INTERVAL_SECONDS: '1800',
        TZ: 'America/New_York',
        PUID: '1026',
        PGID: '100',
        NODE_ENV: 'production' as const,
      };

      const result = envSchema.parse(env);

      expect(result).toEqual(env);
    });

    it('should accept minimal valid configuration with only required fields', () => {
      const env = {
        DATABASE_URL: 'file:./wanwatch.db',
        NEXTAUTH_SECRET: 'minimum-32-character-secret-key-required',
        NEXTAUTH_URL: 'http://localhost:3000',
      };

      const result = envSchema.parse(env);

      expect(result.DATABASE_URL).toBe(env.DATABASE_URL);
      expect(result.NEXTAUTH_SECRET).toBe(env.NEXTAUTH_SECRET);
      expect(result.NEXTAUTH_URL).toBe(env.NEXTAUTH_URL);
      // Check defaults
      expect(result.NODE_ENV).toBe('development');
      expect(result.CHECK_INTERVAL_SECONDS).toBe('300');
      expect(result.ENABLE_MONITORING).toBe('false');
    });
  });
});
