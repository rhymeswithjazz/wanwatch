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
    'lib/**/*.{ts,tsx}',
    'components/**/*.{ts,tsx}',
    'app/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/.next/**',
    '!**/coverage/**',
    '!app/layout.tsx', // Skip layout (hard to test)
    '!app/startup.ts', // Skip startup (integration test)
  ],
  coverageThreshold: {
    // Apply thresholds only to critical monitoring code that has tests
    // Global thresholds removed - unrealistic for Next.js app with React components
    'lib/monitoring/connectivity-checker.ts': {
      statements: 100,
      branches: 100,
      functions: 100,
      lines: 100,
    },
    'lib/monitoring/scheduler.ts': {
      statements: 70,
      branches: 50,
      functions: 70,
      lines: 70,
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
