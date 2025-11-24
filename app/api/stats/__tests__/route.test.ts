/**
 * Tests for /api/stats route
 *
 * Tests the dashboard statistics API including:
 * - Authentication checks
 * - Data aggregation
 * - Error handling
 */

// Mock NextResponse before importing route
jest.mock('next/server', () => {
  return {
    NextResponse: {
      json: (body: unknown, init?: ResponseInit) => {
        const response = new Response(JSON.stringify(body), {
          status: init?.status || 200,
          headers: {
            'Content-Type': 'application/json',
            ...Object.fromEntries(
              Object.entries(init?.headers || {})
            ),
          },
        });
        return response;
      },
    },
  };
});

import { GET } from '../route';

// Mock variables - declared as let for later assignment
let mockSession: { user?: { email?: string } } | null = null;
let mockOutageCount: jest.Mock;
let mockOutageFindFirst: jest.Mock;
let mockOutageFindMany: jest.Mock;
let mockOutageAggregate: jest.Mock;
let mockSpeedTestFindFirst: jest.Mock;
let mockLogRequest: jest.Mock;

// Mock auth - uses closure to access mockSession
jest.mock('@/lib/auth', () => {
  (global as Record<string, unknown>).__mockSession = null;
  return {
    auth: jest.fn(() => Promise.resolve((global as Record<string, unknown>).__mockSession)),
  };
});

// Mock prisma with all required methods
jest.mock('@/lib/db', () => {
  const outageCount = jest.fn();
  const outageFindFirst = jest.fn();
  const outageFindMany = jest.fn();
  const outageAggregate = jest.fn();
  const speedTestFindFirst = jest.fn();

  (global as Record<string, unknown>).__mockOutageCount = outageCount;
  (global as Record<string, unknown>).__mockOutageFindFirst = outageFindFirst;
  (global as Record<string, unknown>).__mockOutageFindMany = outageFindMany;
  (global as Record<string, unknown>).__mockOutageAggregate = outageAggregate;
  (global as Record<string, unknown>).__mockSpeedTestFindFirst = speedTestFindFirst;

  return {
    prisma: {
      outage: {
        count: outageCount,
        findFirst: outageFindFirst,
        findMany: outageFindMany,
        aggregate: outageAggregate,
      },
      speedTest: {
        findFirst: speedTestFindFirst,
      },
    },
  };
});

// Mock logger
jest.mock('@/lib/logger', () => {
  const logRequest = jest.fn();
  (global as Record<string, unknown>).__mockLogRequest = logRequest;
  return {
    logger: {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      logRequest,
    },
  };
});

// Get mock references after module initialization
beforeAll(() => {
  mockOutageCount = (global as Record<string, unknown>).__mockOutageCount as jest.Mock;
  mockOutageFindFirst = (global as Record<string, unknown>).__mockOutageFindFirst as jest.Mock;
  mockOutageFindMany = (global as Record<string, unknown>).__mockOutageFindMany as jest.Mock;
  mockOutageAggregate = (global as Record<string, unknown>).__mockOutageAggregate as jest.Mock;
  mockSpeedTestFindFirst = (global as Record<string, unknown>).__mockSpeedTestFindFirst as jest.Mock;
  mockLogRequest = (global as Record<string, unknown>).__mockLogRequest as jest.Mock;
});

describe('GET /api/stats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Set session via global reference
    (global as Record<string, unknown>).__mockSession = { user: { email: 'test@example.com' } };

    // Default mock responses
    mockOutageCount.mockResolvedValue(5);
    mockOutageFindFirst.mockResolvedValue(null);
    mockOutageFindMany.mockResolvedValue([]);
    mockOutageAggregate.mockResolvedValue({ _sum: { durationSec: null } });
    mockSpeedTestFindFirst.mockResolvedValue(null);
  });

  describe('authentication', () => {
    it('should return 401 when not authenticated', async () => {
      (global as Record<string, unknown>).__mockSession = null;

      const response = await GET();

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: 'Unauthorized' });
    });

    it('should log unauthorized request', async () => {
      (global as Record<string, unknown>).__mockSession = null;

      await GET();

      expect(mockLogRequest).toHaveBeenCalledWith(
        'GET',
        '/api/stats',
        401,
        expect.any(Number),
        expect.objectContaining({ reason: 'Unauthorized - no session' })
      );
    });

    it('should proceed when authenticated', async () => {
      // Session is already set in beforeEach

      const response = await GET();

      expect(response.status).toBe(200);
    });
  });

  describe('data aggregation', () => {
    it('should return total outages count', async () => {
      mockOutageCount.mockResolvedValue(10);

      const response = await GET();
      const data = await response.json();

      expect(mockOutageCount).toHaveBeenCalledWith({ where: { isResolved: true } });
      expect(data.totalOutages).toBe(10);
    });

    it('should return active outage if exists', async () => {
      const activeOutage = {
        id: 'outage-1',
        startTime: new Date('2025-01-15T10:00:00Z'),
        endTime: null,
        isResolved: false,
      };
      mockOutageFindFirst.mockResolvedValue(activeOutage);

      const response = await GET();
      const data = await response.json();

      expect(mockOutageFindFirst).toHaveBeenCalledWith({
        where: { isResolved: false },
      });
      // Dates are serialized to ISO strings in JSON response
      expect(data.activeOutage).toEqual({
        id: 'outage-1',
        startTime: '2025-01-15T10:00:00.000Z',
        endTime: null,
        isResolved: false,
      });
    });

    it('should return null for activeOutage when none exists', async () => {
      mockOutageFindFirst.mockResolvedValue(null);

      const response = await GET();
      const data = await response.json();

      expect(data.activeOutage).toBeNull();
    });

    it('should return outage history', async () => {
      const outageHistory = [
        {
          id: 'outage-1',
          startTime: new Date('2025-01-15T10:00:00Z'),
          endTime: new Date('2025-01-15T10:30:00Z'),
          durationSec: 1800,
          isResolved: true,
          checksCount: 60,
          emailSent: true,
        },
        {
          id: 'outage-2',
          startTime: new Date('2025-01-14T08:00:00Z'),
          endTime: new Date('2025-01-14T08:15:00Z'),
          durationSec: 900,
          isResolved: true,
          checksCount: 30,
          emailSent: true,
        },
      ];
      mockOutageFindMany.mockResolvedValue(outageHistory);

      const response = await GET();
      const data = await response.json();

      expect(mockOutageFindMany).toHaveBeenCalledWith({
        take: 50,
        orderBy: { startTime: 'desc' },
        where: { isResolved: true },
      });
      expect(data.outageHistory).toHaveLength(2);
    });

    it('should calculate total downtime', async () => {
      mockOutageAggregate.mockResolvedValue({ _sum: { durationSec: 3600 } });

      const response = await GET();
      const data = await response.json();

      expect(mockOutageAggregate).toHaveBeenCalledWith({
        where: { isResolved: true },
        _sum: { durationSec: true },
      });
      expect(data.totalDowntimeSec).toBe(3600);
    });

    it('should handle null total downtime', async () => {
      mockOutageAggregate.mockResolvedValue({ _sum: { durationSec: null } });

      const response = await GET();
      const data = await response.json();

      expect(data.totalDowntimeSec).toBe(0);
    });

    it('should calculate average outage duration', async () => {
      const outageHistory = [
        { id: '1', startTime: new Date(), endTime: new Date(), durationSec: 600, isResolved: true, checksCount: 20, emailSent: true },
        { id: '2', startTime: new Date(), endTime: new Date(), durationSec: 300, isResolved: true, checksCount: 10, emailSent: true },
      ];
      mockOutageFindMany.mockResolvedValue(outageHistory);
      mockOutageAggregate.mockResolvedValue({ _sum: { durationSec: 900 } });

      const response = await GET();
      const data = await response.json();

      // Average: 900 / 2 = 450
      expect(data.avgOutageDurationSec).toBe(450);
    });

    it('should handle zero outages for average calculation', async () => {
      mockOutageFindMany.mockResolvedValue([]);
      mockOutageAggregate.mockResolvedValue({ _sum: { durationSec: 0 } });

      const response = await GET();
      const data = await response.json();

      expect(data.avgOutageDurationSec).toBe(0);
    });
  });

  describe('speed test data', () => {
    it('should return latest speed test if exists', async () => {
      const latestSpeedTest = {
        downloadMbps: 100,
        uploadMbps: 20,
        pingMs: 15,
        timestamp: new Date('2025-01-15T12:00:00Z'),
      };
      mockSpeedTestFindFirst.mockResolvedValue(latestSpeedTest);

      const response = await GET();
      const data = await response.json();

      expect(mockSpeedTestFindFirst).toHaveBeenCalledWith({
        orderBy: { timestamp: 'desc' },
        select: {
          downloadMbps: true,
          uploadMbps: true,
          pingMs: true,
          timestamp: true,
        },
      });
      // Dates are serialized to ISO strings in JSON response
      expect(data.latestSpeedTest).toEqual({
        downloadMbps: 100,
        uploadMbps: 20,
        pingMs: 15,
        timestamp: '2025-01-15T12:00:00.000Z',
      });
    });

    it('should return null when no speed test exists', async () => {
      mockSpeedTestFindFirst.mockResolvedValue(null);

      const response = await GET();
      const data = await response.json();

      expect(data.latestSpeedTest).toBeNull();
    });
  });

  describe('response format', () => {
    it('should return empty recentChecks array (backward compatibility)', async () => {
      const response = await GET();
      const data = await response.json();

      expect(data.recentChecks).toEqual([]);
    });

    it('should set cache headers', async () => {
      const response = await GET();

      expect(response.headers.get('Cache-Control')).toBe(
        'private, max-age=30, stale-while-revalidate=60'
      );
    });

    it('should log successful request', async () => {
      mockOutageCount.mockResolvedValue(5);

      await GET();

      expect(mockLogRequest).toHaveBeenCalledWith(
        'GET',
        '/api/stats',
        200,
        expect.any(Number),
        expect.objectContaining({
          userId: 'test@example.com',
          totalOutages: 5,
        })
      );
    });
  });

  describe('error handling', () => {
    it('should return 500 on database error', async () => {
      mockOutageCount.mockRejectedValue(new Error('Database connection failed'));

      const response = await GET();

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data).toEqual({ error: 'Failed to fetch statistics' });
    });

    it('should log error request', async () => {
      mockOutageCount.mockRejectedValue(new Error('Database connection failed'));

      await GET();

      expect(mockLogRequest).toHaveBeenCalledWith(
        'GET',
        '/api/stats',
        500,
        expect.any(Number),
        expect.objectContaining({
          error: 'Database connection failed',
          userId: 'test@example.com',
        })
      );
    });

    it('should handle non-Error objects', async () => {
      mockOutageCount.mockRejectedValue('String error');

      const response = await GET();

      expect(response.status).toBe(500);
      expect(mockLogRequest).toHaveBeenCalledWith(
        'GET',
        '/api/stats',
        500,
        expect.any(Number),
        expect.objectContaining({
          error: 'Unknown error',
        })
      );
    });
  });
});
