const nextJest = require('next/jest')

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
})

// Add any custom config to be passed to Jest
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  collectCoverageFrom: [
    // Core business logic - INCLUDE
    'lib/monitoring/**/*.ts',
    'lib/logger.ts',
    'lib/settings.ts',

    // API routes with tests - INCLUDE
    'app/api/stats/route.ts',

    // Exclude from coverage
    '!**/*.d.ts',
    '!**/*.test.ts',
  ],
  coverageThreshold: {
    // Per-file thresholds for tested modules
    'lib/monitoring/connectivity-checker.ts': {
      statements: 100,
      branches: 100,
      functions: 100,
      lines: 100,
    },
    'lib/monitoring/email-notifier.ts': {
      statements: 100,
      branches: 90,
      functions: 100,
      lines: 100,
    },
    'lib/monitoring/speed-tester.ts': {
      statements: 100,
      branches: 90,
      functions: 100,
      lines: 100,
    },
    'lib/logger.ts': {
      statements: 95,
      branches: 85,
      functions: 100,
      lines: 95,
    },
    'lib/settings.ts': {
      statements: 100,
      branches: 90,
      functions: 100,
      lines: 100,
    },
    'lib/monitoring/scheduler.ts': {
      statements: 75,
      branches: 55,
      functions: 70,
      lines: 75,
    },
    // Global threshold for everything else
    global: {
      statements: 90,
      branches: 80,
      functions: 85,
      lines: 90,
    },
  },
  testMatch: [
    '**/__tests__/**/*.test.{ts,tsx}',
    '**/*.test.{ts,tsx}',
  ],
  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.next/',
    '/coverage/',
  ],
  // Transform files
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig)
