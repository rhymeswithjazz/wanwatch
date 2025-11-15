/**
 * Factory for creating mock ConnectionCheck data for tests
 */

export interface MockConnectionCheck {
  id: string;
  timestamp: Date;
  isConnected: boolean;
  latencyMs: number | null;
  target: string;
}

export function createMockConnectionCheck(
  overrides: Partial<MockConnectionCheck> = {}
): MockConnectionCheck {
  return {
    id: 'test-check-id',
    timestamp: new Date('2025-01-15T12:00:00Z'),
    isConnected: true,
    latencyMs: 20,
    target: '8.8.8.8',
    ...overrides,
  };
}

export function createMockConnectionChecks(
  count: number,
  overrides: Partial<MockConnectionCheck> = {}
): MockConnectionCheck[] {
  return Array.from({ length: count }, (_, index) =>
    createMockConnectionCheck({
      id: `test-check-${index}`,
      timestamp: new Date(Date.now() - (count - index) * 60000), // 1 minute apart
      ...overrides,
    })
  );
}

export function createMockFailedCheck(
  overrides: Partial<MockConnectionCheck> = {}
): MockConnectionCheck {
  return createMockConnectionCheck({
    isConnected: false,
    latencyMs: null,
    ...overrides,
  });
}

export function createMockSuccessfulCheck(
  overrides: Partial<MockConnectionCheck> = {}
): MockConnectionCheck {
  return createMockConnectionCheck({
    isConnected: true,
    latencyMs: 20,
    ...overrides,
  });
}
