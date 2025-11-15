# WanWatch Testing Plan

**Created**: 2025-11-15
**Branch**: `feature/add-unit-tests`
**Status**: Planning Phase
**Goal**: Achieve comprehensive test coverage to ensure refactoring safety

---

## Table of Contents

1. [Testing Strategy](#testing-strategy)
2. [Test Environment Setup](#test-environment-setup)
3. [Testing Layers](#testing-layers)
4. [Test Coverage Plan](#test-coverage-plan)
5. [Implementation Phases](#implementation-phases)
6. [Testing Tools & Libraries](#testing-tools--libraries)
7. [CI/CD Integration](#cicd-integration)

---

## Testing Strategy

### Philosophy

- **Test for behavior, not implementation** - Focus on what the code does, not how
- **Regression prevention** - Ensure refactoring doesn't break existing functionality
- **Fast feedback loops** - Tests should run quickly for rapid development
- **Maintainable tests** - Clear, readable test code that's easy to update
- **Realistic mocking** - Mock external dependencies but keep tests close to reality

### Coverage Goals

- **Unit Tests**: 80%+ coverage for critical business logic
- **Integration Tests**: All API endpoints covered
- **E2E Tests**: Critical user flows (login, view dashboard, settings)

### Test Pyramid

```
           /\
          /E2E\          <- Few (5-10 tests)
         /------\
        /Integration\    <- Medium (20-30 tests)
       /------------\
      /  Unit Tests  \   <- Many (50-100 tests)
     /----------------\
```

---

## Test Environment Setup

### Required Dependencies

```json
{
  "devDependencies": {
    "@testing-library/react": "^16.1.0",
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/user-event": "^14.5.2",
    "jest": "^29.7.0",
    "jest-environment-jsdom": "^29.7.0",
    "@types/jest": "^29.5.14",
    "ts-jest": "^29.2.5",
    "msw": "^2.7.0",
    "nock": "^14.0.0-beta.21",
    "@playwright/test": "^1.49.1"
  }
}
```

### Configuration Files

#### `jest.config.js`
```javascript
const nextJest = require('next/jest')

const createJestConfig = nextJest({
  dir: './',
})

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
  ],
  coverageThreshold: {
    global: {
      statements: 70,
      branches: 65,
      functions: 70,
      lines: 70,
    },
  },
  testMatch: [
    '**/__tests__/**/*.test.{ts,tsx}',
    '**/*.test.{ts,tsx}',
  ],
}

module.exports = createJestConfig(customJestConfig)
```

#### `jest.setup.js`
```javascript
import '@testing-library/jest-dom'
```

#### `playwright.config.ts`
```typescript
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
})
```

---

## Testing Layers

### 1. Unit Tests

**Purpose**: Test individual functions, utilities, and pure logic in isolation

**Focus Areas**:
- Utility functions
- Data transformations
- Business logic
- Type validators
- Pure helper functions

**Example**:
```typescript
// lib/utils/__tests__/format-duration.test.ts
describe('formatDuration', () => {
  it('formats seconds correctly', () => {
    expect(formatDuration(45)).toBe('45s')
  })

  it('formats minutes and seconds correctly', () => {
    expect(formatDuration(125)).toBe('2m 5s')
  })

  it('formats hours, minutes, and seconds correctly', () => {
    expect(formatDuration(3725)).toBe('1h 2m 5s')
  })
})
```

### 2. Integration Tests

**Purpose**: Test how multiple units work together, especially API routes and database interactions

**Focus Areas**:
- API endpoints
- Database queries (with test database)
- Authentication flows
- Monitoring system integration
- Email sending

**Example**:
```typescript
// app/api/stats/__tests__/route.test.ts
describe('GET /api/stats', () => {
  it('returns 401 when not authenticated', async () => {
    const response = await GET(mockRequest)
    expect(response.status).toBe(401)
  })

  it('returns stats when authenticated', async () => {
    const response = await GET(mockAuthenticatedRequest)
    const data = await response.json()

    expect(data).toHaveProperty('totalOutages')
    expect(data).toHaveProperty('activeOutage')
  })
})
```

### 3. Component Tests

**Purpose**: Test React components render correctly and handle user interactions

**Focus Areas**:
- UI components
- Form handling
- User interactions
- Conditional rendering
- State management

**Example**:
```typescript
// components/__tests__/stats-dashboard.test.tsx
describe('StatsDisplay', () => {
  it('shows loading state initially', () => {
    render(<StatsDisplay />)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('displays stats after loading', async () => {
    render(<StatsDisplay />)
    await waitFor(() => {
      expect(screen.getByText(/total outages/i)).toBeInTheDocument()
    })
  })
})
```

### 4. E2E Tests

**Purpose**: Test complete user flows from start to finish

**Focus Areas**:
- Login flow
- Dashboard viewing
- Settings changes
- Speed test triggering
- Log viewing

**Example**:
```typescript
// e2e/dashboard.spec.ts
test('user can view dashboard after login', async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[type="email"]', 'admin@example.com')
  await page.fill('input[type="password"]', 'password')
  await page.click('button[type="submit"]')

  await expect(page).toHaveURL('/dashboard')
  await expect(page.locator('h1')).toContainText('WanWatch')
})
```

---

## Test Coverage Plan

### Phase 1: Critical Business Logic (High Priority)

#### 1.1 Environment Validation (`lib/env.ts`)
**Priority**: CRITICAL
**Tests**: 15-20
**Coverage Target**: 100%

```typescript
// lib/__tests__/env.test.ts
describe('Environment Validation', () => {
  describe('Required Variables', () => {
    it('throws error when DATABASE_URL is missing')
    it('throws error when NEXTAUTH_SECRET is too short')
    it('throws error when NEXTAUTH_URL is invalid URL')
  })

  describe('Optional Variables', () => {
    it('uses default CHECK_INTERVAL_SECONDS when not set')
    it('validates CHECK_INTERVAL_SECONDS is numeric')
  })

  describe('Email Configuration', () => {
    it('validates SMTP_PORT is numeric when provided')
    it('validates EMAIL_FROM is valid email format')
  })
})
```

#### 1.2 Connectivity Checker (`lib/monitoring/connectivity-checker.ts`)
**Priority**: CRITICAL
**Tests**: 25-30
**Coverage Target**: 85%+

```typescript
// lib/monitoring/__tests__/connectivity-checker.test.ts
describe('ConnectivityChecker', () => {
  describe('checkConnection', () => {
    it('returns connected when first target succeeds')
    it('tries all targets when first fails')
    it('returns disconnected when all targets fail')
    it('logs successful checks to database')
    it('logs failed checks to database')
  })

  describe('handleConnectionStatus', () => {
    it('creates outage when disconnected with no active outage')
    it('increments checksCount when already in outage')
    it('resolves outage when reconnected')
    it('sends email when outage resolved')
    it('handles multiple rapid state changes')
  })

  describe('pingTarget', () => {
    it('parses latency from ping output correctly')
    it('handles DNS resolution failures')
    it('handles timeout errors')
    it('handles network unreachable errors')
  })
})
```

#### 1.3 Scheduler (`lib/monitoring/scheduler.ts`)
**Priority**: CRITICAL
**Tests**: 15-20
**Coverage Target**: 90%+

```typescript
// lib/monitoring/__tests__/scheduler.test.ts
describe('Scheduler', () => {
  describe('startMonitoring', () => {
    it('starts in normal mode by default')
    it('runs check immediately on startup')
    it('schedules interval checks')
    it('does not start when ENABLE_MONITORING is false in dev')
    it('always starts in production mode')
  })

  describe('Adaptive Monitoring', () => {
    it('switches to outage mode when disconnection detected')
    it('switches back to normal mode when reconnected')
    it('uses correct intervals for each mode')
    it('logs mode transitions')
  })

  describe('stopMonitoring', () => {
    it('clears interval timer')
    it('prevents further checks')
  })
})
```

#### 1.4 Speed Tester (`lib/monitoring/speed-tester.ts`)
**Priority**: HIGH
**Tests**: 20-25
**Coverage Target**: 80%+

```typescript
// lib/monitoring/__tests__/speed-tester.test.ts
describe('SpeedTester', () => {
  describe('runSpeedTest', () => {
    it('executes speedtest CLI with correct arguments')
    it('parses JSON output correctly')
    it('converts bytes/sec to Mbps correctly')
    it('stores results in database')
    it('handles CLI not installed gracefully')
    it('handles timeout errors')
    it('handles invalid JSON response')
  })

  describe('startScheduledTests', () => {
    it('schedules tests at configured interval')
    it('does not start when ENABLE_SPEED_TEST is false')
    it('logs test results')
  })
})
```

#### 1.5 Email Notifier (`lib/monitoring/email-notifier.ts`)
**Priority**: HIGH
**Tests**: 15-20
**Coverage Target**: 85%+

```typescript
// lib/monitoring/__tests__/email-notifier.test.ts
describe('EmailNotifier', () => {
  describe('sendOutageRestoredEmail', () => {
    it('sends email with correct outage details')
    it('formats duration correctly')
    it('includes dashboard link')
    it('handles SMTP errors gracefully')
    it('does not crash app when email fails')
    it('logs success to SystemLog')
    it('logs failure to SystemLog')
  })

  describe('Configuration', () => {
    it('skips sending when SMTP not configured')
    it('validates email addresses before sending')
  })
})
```

#### 1.6 Logger (`lib/logger.ts`)
**Priority**: HIGH
**Tests**: 20-25
**Coverage Target**: 85%+

```typescript
// lib/__tests__/logger.test.ts
describe('Logger', () => {
  describe('Log Levels', () => {
    it('logs DEBUG to console only')
    it('logs INFO to console only')
    it('logs WARN to console and database')
    it('logs ERROR to console and database')
    it('logs CRITICAL to console and database')
  })

  describe('Specialized Loggers', () => {
    it('logRequest formats HTTP request data correctly')
    it('logConnectivityCheck logs failures to database')
    it('logOutage logs outage events')
    it('logEmail logs email send attempts')
    it('logAuth logs authentication events')
  })

  describe('withTiming', () => {
    it('measures operation duration')
    it('logs duration on completion')
    it('returns operation result')
  })
})
```

---

### Phase 2: API Routes (High Priority)

#### 2.1 Stats API (`app/api/stats/route.ts`)
**Priority**: HIGH
**Tests**: 15-20
**Coverage Target**: 90%+

```typescript
// app/api/stats/__tests__/route.test.ts
describe('GET /api/stats', () => {
  it('returns 401 when not authenticated')
  it('returns stats when authenticated')
  it('includes totalOutages count')
  it('includes activeOutage if exists')
  it('includes outageHistory (last 50)')
  it('calculates totalDowntimeSec correctly')
  it('calculates avgOutageDurationSec correctly')
  it('handles database errors gracefully')
  it('includes Cache-Control headers')
})
```

#### 2.2 Chart Data API (`app/api/stats/chart-data/route.ts`)
**Priority**: HIGH
**Tests**: 20-25
**Coverage Target**: 90%+

```typescript
// app/api/stats/chart-data/__tests__/route.test.ts
describe('GET /api/stats/chart-data', () => {
  it('returns 401 when not authenticated')
  it('filters data by time period correctly')
  it('downsamples large datasets')
  it('preserves disconnections in downsampling')
  it('handles all time period values (5m, 15m, 1h, 6h, 24h, all)')
  it('returns empty array when no data exists')
  it('includes Cache-Control headers')
})
```

#### 2.3 Settings APIs
**Priority**: MEDIUM
**Tests**: 30-35
**Coverage Target**: 85%+

```typescript
// app/api/settings/monitoring/__tests__/route.test.ts
describe('Monitoring Settings API', () => {
  describe('GET /api/settings/monitoring', () => {
    it('returns current settings')
    it('returns env defaults when no database settings')
  })

  describe('POST /api/settings/monitoring', () => {
    it('updates intervals successfully')
    it('validates interval ranges')
    it('restarts scheduler with new intervals')
  })
})

// app/api/settings/targets/__tests__/route.test.ts
describe('Targets Settings API', () => {
  describe('GET /api/settings/targets', () => {
    it('returns all monitoring targets')
    it('includes enabled/disabled status')
  })

  describe('POST /api/settings/targets', () => {
    it('creates new target')
    it('updates existing target')
    it('validates target format')
  })

  describe('DELETE /api/settings/targets', () => {
    it('deletes target by ID')
    it('prevents deleting last enabled target')
  })
})
```

#### 2.4 Speed Test API (`app/api/speedtest/`)
**Priority**: MEDIUM
**Tests**: 15-20
**Coverage Target**: 80%+

```typescript
// app/api/speedtest/__tests__/route.test.ts
describe('Speed Test API', () => {
  describe('GET /api/speedtest', () => {
    it('returns recent speed test history')
    it('limits results to specified count')
  })

  describe('POST /api/speedtest/run', () => {
    it('triggers manual speed test')
    it('invalidates cache after test')
    it('returns new test results')
    it('handles test failures gracefully')
  })
})
```

---

### Phase 3: Utility Functions & Helpers (Medium Priority)

#### 3.1 Date/Time Utilities
**Priority**: MEDIUM
**Tests**: 10-15
**Coverage Target**: 100%

```typescript
// lib/utils/__tests__/format-duration.test.ts
describe('formatDuration', () => {
  it('formats seconds only')
  it('formats minutes and seconds')
  it('formats hours, minutes, and seconds')
  it('handles zero duration')
  it('handles null/undefined gracefully')
})

// lib/utils/__tests__/format-date.test.ts
describe('formatDate', () => {
  it('formats date correctly')
  it('formats datetime correctly')
  it('handles invalid dates')
})
```

#### 3.2 Type Guards & Validators
**Priority**: MEDIUM
**Tests**: 10-15
**Coverage Target**: 100%

```typescript
// lib/utils/__tests__/validators.test.ts
describe('Validators', () => {
  describe('isValidEmail', () => {
    it('validates correct email formats')
    it('rejects invalid formats')
  })

  describe('isValidUrl', () => {
    it('validates correct URLs')
    it('rejects invalid URLs')
  })
})
```

---

### Phase 4: React Components (Medium Priority)

#### 4.1 Dashboard Components
**Priority**: MEDIUM
**Tests**: 25-30
**Coverage Target**: 75%+

```typescript
// components/__tests__/stats-dashboard.test.tsx
describe('StatsDisplay', () => {
  it('shows loading state initially')
  it('displays stats after data loads')
  it('shows error state on fetch failure')
  it('auto-refreshes every 60 seconds')
  it('updates when time period changes')
})

// components/__tests__/status-cards.test.tsx
describe('StatusCards', () => {
  it('displays online status correctly')
  it('displays offline status with active outage')
  it('shows total outages count')
  it('formats downtime duration correctly')
})

// components/__tests__/timeline-chart.test.tsx
describe('TimelineChart', () => {
  it('renders bar chart with data')
  it('uses green for connected status')
  it('uses red for disconnected status')
  it('handles empty data gracefully')
})
```

#### 4.2 Settings Components
**Priority**: MEDIUM
**Tests**: 20-25
**Coverage Target**: 70%+

```typescript
// components/__tests__/monitoring-intervals.test.tsx
describe('MonitoringIntervals', () => {
  it('displays current interval values')
  it('validates min/max ranges on input')
  it('saves changes successfully')
  it('shows success toast on save')
  it('shows error toast on failure')
})

// components/__tests__/targets-manager.test.tsx
describe('TargetsManager', () => {
  it('displays list of targets')
  it('adds new target')
  it('edits existing target')
  it('deletes target')
  it('toggles enabled/disabled status')
})
```

#### 4.3 Navigation & Layout Components
**Priority**: LOW
**Tests**: 10-15
**Coverage Target**: 60%+

```typescript
// components/__tests__/nav-menu.test.tsx
describe('NavMenu', () => {
  it('shows Dashboard link when on other pages')
  it('shows Settings link when not on settings')
  it('shows Sign Out option')
  it('calls onSignOut when clicked')
})
```

---

### Phase 5: Authentication & Middleware (High Priority)

#### 5.1 NextAuth Configuration
**Priority**: HIGH
**Tests**: 15-20
**Coverage Target**: 80%+

```typescript
// lib/__tests__/auth.test.ts
describe('NextAuth Configuration', () => {
  describe('Credentials Provider', () => {
    it('authenticates valid credentials')
    it('rejects invalid email')
    it('rejects invalid password')
    it('returns user data on success')
  })

  describe('Session Handling', () => {
    it('includes user ID in session')
    it('includes email in session')
    it('includes name in session')
  })
})
```

#### 5.2 Middleware
**Priority**: HIGH
**Tests**: 10-15
**Coverage Target**: 90%+

```typescript
// __tests__/middleware.test.ts
describe('Middleware', () => {
  it('redirects to login when accessing dashboard unauthenticated')
  it('allows access to dashboard when authenticated')
  it('redirects to dashboard when accessing login while authenticated')
  it('allows access to public routes')
})
```

---

### Phase 6: Database Layer (Medium Priority)

#### 6.1 Prisma Client Wrapper
**Priority**: MEDIUM
**Tests**: 10-15
**Coverage Target**: 70%+

```typescript
// lib/__tests__/db.test.ts
describe('Prisma Client', () => {
  it('creates singleton instance')
  it('reuses instance in development')
  it('handles connection errors gracefully')
})
```

---

### Phase 7: E2E Tests (Medium Priority)

#### 7.1 Critical User Flows
**Priority**: MEDIUM
**Tests**: 10-15
**Coverage Target**: Key flows only

```typescript
// e2e/auth.spec.ts
test('user can login and logout', async ({ page }) => {
  // Test login flow
  // Test logout flow
})

// e2e/dashboard.spec.ts
test('dashboard displays stats correctly', async ({ page }) => {
  // Test stats cards
  // Test chart rendering
  // Test outage table
})

// e2e/settings.spec.ts
test('user can change monitoring intervals', async ({ page }) => {
  // Navigate to settings
  // Change intervals
  // Save and verify
})

// e2e/speedtest.spec.ts
test('user can trigger manual speed test', async ({ page }) => {
  // Navigate to speed test page
  // Click "Run Test Now"
  // Verify results appear
})
```

---

## Implementation Phases

### Phase 1: Setup & Critical Tests (Week 1)
**Goal**: Get testing infrastructure working and cover critical business logic

**Tasks**:
1. Install testing dependencies
2. Configure Jest and Testing Library
3. Create test utilities and mocks
4. Write tests for `lib/env.ts`
5. Write tests for `lib/monitoring/connectivity-checker.ts`
6. Write tests for `lib/monitoring/scheduler.ts`
7. Achieve 80%+ coverage on monitoring system

**Success Criteria**:
- All tests passing
- CI pipeline running tests
- Critical monitoring logic covered

---

### Phase 2: API Routes & Integration (Week 2)
**Goal**: Ensure all API endpoints are working correctly

**Tasks**:
1. Create test database setup/teardown utilities
2. Write tests for `/api/stats`
3. Write tests for `/api/stats/chart-data`
4. Write tests for `/api/settings/*`
5. Write tests for `/api/speedtest`
6. Mock external HTTP calls (ipify, ip-api)

**Success Criteria**:
- All API routes tested
- 85%+ coverage on API routes
- Database integration tests working

---

### Phase 3: Components & UI (Week 3)
**Goal**: Test React components render and behave correctly

**Tasks**:
1. Write tests for `StatsDisplay`
2. Write tests for settings components
3. Write tests for navigation components
4. Mock SWR hooks for component tests
5. Test user interactions

**Success Criteria**:
- Key components tested
- 70%+ coverage on components
- User interactions verified

---

### Phase 4: E2E & Polish (Week 4)
**Goal**: Add end-to-end tests and achieve coverage targets

**Tasks**:
1. Set up Playwright
2. Write authentication flow tests
3. Write dashboard flow tests
4. Write settings flow tests
5. Review and improve coverage
6. Document testing practices

**Success Criteria**:
- E2E tests covering critical flows
- Overall coverage: 75%+
- All tests documented
- CI/CD pipeline stable

---

## Testing Tools & Libraries

### Core Testing Framework
- **Jest**: Test runner and assertion library
- **ts-jest**: TypeScript support for Jest
- **@testing-library/react**: React component testing utilities
- **@testing-library/jest-dom**: Custom Jest matchers for DOM
- **@testing-library/user-event**: User interaction simulation

### Mocking & Stubbing
- **msw** (Mock Service Worker): API mocking for browser and Node
- **nock**: HTTP request mocking for Node.js
- **jest.mock()**: Built-in Jest mocking

### E2E Testing
- **Playwright**: Browser automation for E2E tests
- **@playwright/test**: Playwright test runner

### Test Database
- **SQLite in-memory database**: Fast, isolated test database
- **Prisma migrations**: Apply schema to test database

---

## CI/CD Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Tests

on:
  push:
    branches: [main, feature/*]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run Prisma migrations
        run: npx prisma migrate deploy
        env:
          DATABASE_URL: file:./test.db

      - name: Run unit tests
        run: npm run test:unit

      - name: Run integration tests
        run: npm run test:integration

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          files: ./coverage/coverage-final.json

  e2e:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright
        run: npx playwright install --with-deps

      - name: Run E2E tests
        run: npm run test:e2e

      - name: Upload Playwright report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

### NPM Scripts

Add to `package.json`:
```json
{
  "scripts": {
    "test": "jest",
    "test:unit": "jest --testPathPattern=__tests__",
    "test:integration": "jest --testPathPattern=integration",
    "test:e2e": "playwright test",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:ci": "jest --ci --coverage --maxWorkers=2"
  }
}
```

---

## Testing Best Practices

### 1. AAA Pattern (Arrange-Act-Assert)
```typescript
test('example test', () => {
  // Arrange - Set up test data
  const input = { foo: 'bar' }

  // Act - Execute the code under test
  const result = myFunction(input)

  // Assert - Verify the result
  expect(result).toBe('expected')
})
```

### 2. Descriptive Test Names
```typescript
// ❌ Bad
test('works', () => {})

// ✅ Good
test('returns connected status when ping succeeds', () => {})
```

### 3. Test One Thing
```typescript
// ❌ Bad - testing multiple behaviors
test('stats API', async () => {
  // Tests authentication AND stats AND caching
})

// ✅ Good - separate tests
test('returns 401 when not authenticated', () => {})
test('returns stats when authenticated', () => {})
test('includes cache headers', () => {})
```

### 4. Mock External Dependencies
```typescript
// Mock Prisma client
jest.mock('@/lib/db', () => ({
  prisma: {
    connectionCheck: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
  },
}))
```

### 5. Clean Up After Tests
```typescript
afterEach(() => {
  jest.clearAllMocks()
})

afterAll(async () => {
  await prisma.$disconnect()
})
```

---

## Test Utilities

### Mock Data Factories

```typescript
// __tests__/factories/outage.factory.ts
export function createMockOutage(overrides = {}) {
  return {
    id: 'test-id',
    startTime: new Date('2025-01-01T00:00:00Z'),
    endTime: new Date('2025-01-01T00:05:00Z'),
    durationSec: 300,
    isResolved: true,
    checksCount: 10,
    emailSent: true,
    ...overrides,
  }
}

// __tests__/factories/connection-check.factory.ts
export function createMockConnectionCheck(overrides = {}) {
  return {
    id: 'test-id',
    timestamp: new Date(),
    isConnected: true,
    latencyMs: 20,
    target: '8.8.8.8',
    ...overrides,
  }
}
```

### Test Database Helpers

```typescript
// __tests__/helpers/db.helper.ts
export async function setupTestDatabase() {
  // Create in-memory SQLite database
  // Apply Prisma migrations
  // Return Prisma client
}

export async function teardownTestDatabase(prisma) {
  await prisma.$disconnect()
}

export async function seedTestData(prisma) {
  // Insert test data
}
```

### Mock Request Helpers

```typescript
// __tests__/helpers/request.helper.ts
export function createMockRequest(options = {}) {
  return new Request('http://localhost:3000', options)
}

export function createAuthenticatedRequest(session) {
  // Create request with valid session
}
```

---

## Success Metrics

### Coverage Targets
- **Overall**: 75%+ coverage
- **Critical modules** (monitoring, env): 85%+ coverage
- **API routes**: 85%+ coverage
- **Components**: 70%+ coverage
- **Utilities**: 90%+ coverage

### Quality Targets
- **All tests passing** in CI
- **No flaky tests** (>99% reliability)
- **Fast test suite** (<2 minutes for unit/integration)
- **E2E tests** complete in <5 minutes

### Maintenance Targets
- **Tests updated** with every feature
- **Test failures** investigated within 24 hours
- **Coverage never decreases** from baseline

---

## Next Steps

1. **Review and Approve** this testing plan
2. **Install dependencies** and configure Jest
3. **Start with Phase 1** - critical business logic tests
4. **Set up CI/CD** to run tests automatically
5. **Iterate and improve** based on learnings

---

**End of Testing Plan**
