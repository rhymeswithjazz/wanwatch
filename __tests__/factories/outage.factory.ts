/**
 * Factory for creating mock Outage data for tests
 */

export interface MockOutage {
  id: string;
  startTime: Date;
  endTime: Date | null;
  durationSec: number | null;
  isResolved: boolean;
  checksCount: number;
  emailSent: boolean;
}

export function createMockOutage(overrides: Partial<MockOutage> = {}): MockOutage {
  const startTime = new Date('2025-01-15T12:00:00Z');
  const endTime = new Date('2025-01-15T12:05:00Z');
  const durationSec = 300; // 5 minutes

  return {
    id: 'test-outage-id',
    startTime,
    endTime,
    durationSec,
    isResolved: true,
    checksCount: 10,
    emailSent: true,
    ...overrides,
  };
}

export function createMockActiveOutage(
  overrides: Partial<MockOutage> = {}
): MockOutage {
  return createMockOutage({
    endTime: null,
    durationSec: null,
    isResolved: false,
    emailSent: false,
    ...overrides,
  });
}

export function createMockResolvedOutage(
  overrides: Partial<MockOutage> = {}
): MockOutage {
  return createMockOutage({
    isResolved: true,
    emailSent: true,
    ...overrides,
  });
}

export function createMockOutages(
  count: number,
  overrides: Partial<MockOutage> = {}
): MockOutage[] {
  return Array.from({ length: count }, (_, index) => {
    const startTime = new Date(Date.now() - (count - index) * 3600000); // 1 hour apart
    const endTime = new Date(startTime.getTime() + 300000); // 5 minutes later

    return createMockOutage({
      id: `test-outage-${index}`,
      startTime,
      endTime,
      ...overrides,
    });
  });
}
