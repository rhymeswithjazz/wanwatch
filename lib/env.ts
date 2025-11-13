import { z } from 'zod';

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
  ENABLE_MONITORING: z.enum(['true', 'false']).default('false'),
  NETWORK_INFO_CACHE_SECONDS: z.string().regex(/^\d+$/).optional(),

  // Docker Configuration (optional)
  TZ: z.string().optional(),
  PUID: z.string().regex(/^\d+$/).optional(),
  PGID: z.string().regex(/^\d+$/).optional(),

  // Node Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Invalid environment variables:');
      error.issues.forEach((issue) => {
        console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
      });
      process.exit(1);
    }
    throw error;
  }
}

export const env = validateEnv();
