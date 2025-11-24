/**
 * Tests for SpeedTester
 *
 * Tests the speed testing system including:
 * - Ookla CLI execution and JSON parsing
 * - Concurrent execution prevention
 * - Unit conversion (bytes to Mbps)
 * - Database persistence
 * - Error handling
 */

import { SpeedTester, SpeedTestResult } from '../speed-tester';

// Mock child_process exec and util.promisify
jest.mock('child_process');
jest.mock('util', () => {
  const mockFn = jest.fn();
  const original = jest.requireActual('util');
  return {
    ...original,
    promisify: jest.fn(() => mockFn),
    __mockExecAsync: mockFn,
  };
});

// Mock prisma
jest.mock('@/lib/db', () => ({
  prisma: {
    speedTest: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

// Mock logger
jest.mock('@/lib/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock utils
jest.mock('@/lib/utils', () => ({
  getErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
}));

import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import * as util from 'util';

const mockExecAsync = (util as Record<string, unknown>).__mockExecAsync as jest.Mock;

// Sample Ookla speedtest CLI output
const createOoklaResult = (overrides: Partial<Record<string, unknown>> = {}) => ({
  type: 'result',
  timestamp: '2025-01-15T12:00:00Z',
  ping: {
    jitter: 2.5,
    latency: 15.3,
    ...(overrides.ping as Record<string, unknown> || {}),
  },
  download: {
    bandwidth: 12500000, // 100 Mbps in bytes/sec
    bytes: 125000000,
    elapsed: 10000,
    ...(overrides.download as Record<string, unknown> || {}),
  },
  upload: {
    bandwidth: 2500000, // 20 Mbps in bytes/sec
    bytes: 25000000,
    elapsed: 10000,
    ...(overrides.upload as Record<string, unknown> || {}),
  },
  isp: 'Test ISP',
  interface: {
    externalIp: '203.0.113.1',
    ...(overrides.interface as Record<string, unknown> || {}),
  },
  server: {
    id: 12345,
    name: 'Test Server',
    location: 'Test City',
    country: 'Test Country',
    ...(overrides.server as Record<string, unknown> || {}),
  },
  result: {
    url: 'https://www.speedtest.net/result/12345',
    ...(overrides.result as Record<string, unknown> || {}),
  },
  ...overrides,
});

describe('SpeedTester', () => {
  let speedTester: SpeedTester;

  beforeEach(() => {
    jest.clearAllMocks();
    speedTester = new SpeedTester();
    (prisma.speedTest.create as jest.Mock).mockResolvedValue({ id: 'test-id' });
  });

  describe('runSpeedTest', () => {
    describe('successful execution', () => {
      it('should execute speedtest CLI and parse JSON output', async () => {
        const ooklaResult = createOoklaResult();
        mockExecAsync.mockResolvedValue({
          stdout: JSON.stringify(ooklaResult),
          stderr: '',
        });

        const result = await speedTester.runSpeedTest();

        expect(mockExecAsync).toHaveBeenCalledWith(
          'speedtest --accept-license --accept-gdpr --format=json',
          { timeout: 60000 }
        );
        expect(result).not.toBeNull();
        expect(result?.downloadMbps).toBeCloseTo(100, 1);
        expect(result?.uploadMbps).toBeCloseTo(20, 1);
      });

      it('should correctly convert bytes/sec to Mbps', async () => {
        const ooklaResult = createOoklaResult({
          download: { bandwidth: 62500000, bytes: 625000000, elapsed: 10000 }, // 500 Mbps
          upload: { bandwidth: 6250000, bytes: 62500000, elapsed: 10000 }, // 50 Mbps
        });
        mockExecAsync.mockResolvedValue({
          stdout: JSON.stringify(ooklaResult),
          stderr: '',
        });

        const result = await speedTester.runSpeedTest();

        // bytes * 8 / 1_000_000 = Mbps
        // 62500000 * 8 / 1000000 = 500
        expect(result?.downloadMbps).toBeCloseTo(500, 1);
        expect(result?.uploadMbps).toBeCloseTo(50, 1);
      });

      it('should extract all metadata from Ookla result', async () => {
        const ooklaResult = createOoklaResult();
        mockExecAsync.mockResolvedValue({
          stdout: JSON.stringify(ooklaResult),
          stderr: '',
        });

        const result = await speedTester.runSpeedTest();

        expect(result).toEqual(
          expect.objectContaining({
            pingMs: 15.3,
            jitterMs: 2.5,
            serverId: '12345',
            serverName: 'Test Server',
            serverCountry: 'Test Country',
            isp: 'Test ISP',
            externalIp: '203.0.113.1',
            resultUrl: 'https://www.speedtest.net/result/12345',
          })
        );
      });

      it('should handle output with license text before JSON', async () => {
        const ooklaResult = createOoklaResult();
        const stdout = `
License accepted.
GDPR accepted.
${JSON.stringify(ooklaResult)}
`;
        mockExecAsync.mockResolvedValue({ stdout, stderr: '' });

        const result = await speedTester.runSpeedTest();

        expect(result).not.toBeNull();
        expect(result?.downloadMbps).toBeCloseTo(100, 1);
      });

      it('should log info on start and completion', async () => {
        const ooklaResult = createOoklaResult();
        mockExecAsync.mockResolvedValue({
          stdout: JSON.stringify(ooklaResult),
          stderr: '',
        });

        await speedTester.runSpeedTest();

        expect(logger.info).toHaveBeenCalledWith('Starting speed test');
        expect(logger.info).toHaveBeenCalledWith(
          'Speed test completed',
          expect.objectContaining({
            download: expect.any(String),
            upload: expect.any(String),
            ping: expect.any(String),
          })
        );
      });
    });

    describe('concurrent execution prevention', () => {
      it('should prevent concurrent executions', async () => {
        const ooklaResult = createOoklaResult();
        // Make the first test take some time
        mockExecAsync.mockImplementation(
          () =>
            new Promise((resolve) =>
              setTimeout(
                () => resolve({ stdout: JSON.stringify(ooklaResult), stderr: '' }),
                100
              )
            )
        );

        // Start first test
        const firstTest = speedTester.runSpeedTest();

        // Immediately try second test
        const secondTest = await speedTester.runSpeedTest();

        // Second should return null
        expect(secondTest).toBeNull();
        expect(logger.warn).toHaveBeenCalledWith(
          'Speed test already running, skipping this interval'
        );

        // First should complete normally
        const firstResult = await firstTest;
        expect(firstResult).not.toBeNull();
      });

      it('should allow new test after previous completes', async () => {
        const ooklaResult = createOoklaResult();
        mockExecAsync.mockResolvedValue({
          stdout: JSON.stringify(ooklaResult),
          stderr: '',
        });

        // First test
        const result1 = await speedTester.runSpeedTest();
        expect(result1).not.toBeNull();

        // Second test after first completes
        const result2 = await speedTester.runSpeedTest();
        expect(result2).not.toBeNull();
        expect(mockExecAsync).toHaveBeenCalledTimes(2);
      });

      it('should reset isRunning flag even after error', async () => {
        mockExecAsync.mockRejectedValueOnce(new Error('Command failed'));

        const result1 = await speedTester.runSpeedTest();
        expect(result1).toBeNull();

        // Should be able to run again
        mockExecAsync.mockResolvedValue({
          stdout: JSON.stringify(createOoklaResult()),
          stderr: '',
        });

        const result2 = await speedTester.runSpeedTest();
        expect(result2).not.toBeNull();
      });
    });

    describe('error handling', () => {
      it('should return null and log error when CLI fails', async () => {
        mockExecAsync.mockRejectedValue(new Error('speedtest: command not found'));

        const result = await speedTester.runSpeedTest();

        expect(result).toBeNull();
        expect(logger.error).toHaveBeenCalledWith(
          'Speed test failed',
          expect.objectContaining({
            error: 'speedtest: command not found',
          })
        );
      });

      it('should return null when no JSON output found', async () => {
        mockExecAsync.mockResolvedValue({
          stdout: 'Some text output without JSON',
          stderr: '',
        });

        const result = await speedTester.runSpeedTest();

        expect(result).toBeNull();
        expect(logger.error).toHaveBeenCalledWith(
          'Speed test failed',
          expect.objectContaining({
            error: 'No JSON output found from speedtest CLI',
          })
        );
      });

      it('should return null when JSON parsing fails', async () => {
        mockExecAsync.mockResolvedValue({
          stdout: '{"type": "result", invalid json',
          stderr: '',
        });

        const result = await speedTester.runSpeedTest();

        expect(result).toBeNull();
        expect(logger.error).toHaveBeenCalled();
      });

      it('should handle timeout errors', async () => {
        const timeoutError = new Error('Command timed out');
        timeoutError.name = 'TimeoutError';
        mockExecAsync.mockRejectedValue(timeoutError);

        const result = await speedTester.runSpeedTest();

        expect(result).toBeNull();
        expect(logger.error).toHaveBeenCalled();
      });
    });

    describe('database persistence', () => {
      it('should save result to database', async () => {
        const ooklaResult = createOoklaResult();
        mockExecAsync.mockResolvedValue({
          stdout: JSON.stringify(ooklaResult),
          stderr: '',
        });

        await speedTester.runSpeedTest();

        expect(prisma.speedTest.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            downloadMbps: expect.any(Number),
            uploadMbps: expect.any(Number),
            pingMs: 15.3,
            jitterMs: 2.5,
            serverId: '12345',
            serverName: 'Test Server',
            serverCountry: 'Test Country',
            isp: 'Test ISP',
            externalIp: '203.0.113.1',
            resultUrl: 'https://www.speedtest.net/result/12345',
          }),
        });
      });

      it('should log debug message on successful save', async () => {
        const ooklaResult = createOoklaResult();
        mockExecAsync.mockResolvedValue({
          stdout: JSON.stringify(ooklaResult),
          stderr: '',
        });

        await speedTester.runSpeedTest();

        expect(logger.debug).toHaveBeenCalledWith(
          'Speed test result saved to database'
        );
      });

      it('should log error when database save fails', async () => {
        const ooklaResult = createOoklaResult();
        mockExecAsync.mockResolvedValue({
          stdout: JSON.stringify(ooklaResult),
          stderr: '',
        });
        (prisma.speedTest.create as jest.Mock).mockRejectedValue(
          new Error('Database connection failed')
        );

        // Should still return result even if save fails
        const result = await speedTester.runSpeedTest();

        expect(result).not.toBeNull();
        expect(logger.error).toHaveBeenCalledWith(
          'Failed to save speed test result',
          expect.objectContaining({
            error: 'Database connection failed',
          })
        );
      });
    });

    describe('handling optional fields', () => {
      it('should handle missing optional fields in Ookla result', async () => {
        const ooklaResult = createOoklaResult({
          server: undefined,
          interface: undefined,
          result: undefined,
        });
        mockExecAsync.mockResolvedValue({
          stdout: JSON.stringify(ooklaResult),
          stderr: '',
        });

        const result = await speedTester.runSpeedTest();

        expect(result).not.toBeNull();
        expect(result?.serverId).toBeUndefined();
        expect(result?.serverName).toBeUndefined();
        expect(result?.externalIp).toBeUndefined();
        expect(result?.resultUrl).toBeUndefined();
      });
    });
  });

  describe('getLatestSpeedTest', () => {
    it('should return latest speed test from database', async () => {
      const mockResult = {
        id: 'test-id',
        timestamp: new Date('2025-01-15T12:00:00Z'),
        downloadMbps: 100,
        uploadMbps: 20,
        pingMs: 15,
        jitterMs: 2.5,
        serverId: '12345',
        serverName: 'Test Server',
        serverCountry: 'Test Country',
        isp: 'Test ISP',
        externalIp: '203.0.113.1',
        resultUrl: 'https://speedtest.net/result/12345',
      };
      (prisma.speedTest.findFirst as jest.Mock).mockResolvedValue(mockResult);

      const result = await speedTester.getLatestSpeedTest();

      expect(prisma.speedTest.findFirst).toHaveBeenCalledWith({
        orderBy: { timestamp: 'desc' },
      });
      expect(result).toEqual(
        expect.objectContaining({
          downloadMbps: 100,
          uploadMbps: 20,
          pingMs: 15,
        })
      );
    });

    it('should return null when no results exist', async () => {
      (prisma.speedTest.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await speedTester.getLatestSpeedTest();

      expect(result).toBeNull();
    });

    it('should convert null fields to undefined', async () => {
      const mockResult = {
        id: 'test-id',
        timestamp: new Date(),
        downloadMbps: 100,
        uploadMbps: 20,
        pingMs: 15,
        jitterMs: null,
        serverId: null,
        serverName: null,
        serverCountry: null,
        isp: null,
        externalIp: null,
        resultUrl: null,
      };
      (prisma.speedTest.findFirst as jest.Mock).mockResolvedValue(mockResult);

      const result = await speedTester.getLatestSpeedTest();

      expect(result?.jitterMs).toBeUndefined();
      expect(result?.serverId).toBeUndefined();
      expect(result?.serverName).toBeUndefined();
    });

    it('should log error and return null on database failure', async () => {
      (prisma.speedTest.findFirst as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      const result = await speedTester.getLatestSpeedTest();

      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to get latest speed test',
        expect.objectContaining({ error: 'Database error' })
      );
    });
  });

  describe('getSpeedTestHistory', () => {
    it('should return speed test history with default limit', async () => {
      const mockResults = [
        {
          id: '1',
          timestamp: new Date('2025-01-15T12:00:00Z'),
          downloadMbps: 100,
          uploadMbps: 20,
          pingMs: 15,
          jitterMs: 2.5,
          serverId: '12345',
          serverName: 'Test Server',
          serverCountry: 'Test Country',
          isp: 'Test ISP',
          externalIp: '203.0.113.1',
          resultUrl: 'https://speedtest.net/result/1',
        },
        {
          id: '2',
          timestamp: new Date('2025-01-15T11:00:00Z'),
          downloadMbps: 95,
          uploadMbps: 18,
          pingMs: 16,
          jitterMs: 3,
          serverId: '12345',
          serverName: 'Test Server',
          serverCountry: 'Test Country',
          isp: 'Test ISP',
          externalIp: '203.0.113.1',
          resultUrl: 'https://speedtest.net/result/2',
        },
      ];
      (prisma.speedTest.findMany as jest.Mock).mockResolvedValue(mockResults);

      const results = await speedTester.getSpeedTestHistory();

      expect(prisma.speedTest.findMany).toHaveBeenCalledWith({
        orderBy: { timestamp: 'desc' },
        take: 100,
      });
      expect(results).toHaveLength(2);
    });

    it('should respect custom limit', async () => {
      (prisma.speedTest.findMany as jest.Mock).mockResolvedValue([]);

      await speedTester.getSpeedTestHistory(50);

      expect(prisma.speedTest.findMany).toHaveBeenCalledWith({
        orderBy: { timestamp: 'desc' },
        take: 50,
      });
    });

    it('should return empty array on database failure', async () => {
      (prisma.speedTest.findMany as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      const results = await speedTester.getSpeedTestHistory();

      expect(results).toEqual([]);
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to get speed test history',
        expect.objectContaining({ error: 'Database error' })
      );
    });

    it('should convert null fields to undefined in history', async () => {
      const mockResults = [
        {
          id: '1',
          timestamp: new Date(),
          downloadMbps: 100,
          uploadMbps: 20,
          pingMs: 15,
          jitterMs: null,
          serverId: null,
          serverName: null,
          serverCountry: null,
          isp: null,
          externalIp: null,
          resultUrl: null,
        },
      ];
      (prisma.speedTest.findMany as jest.Mock).mockResolvedValue(mockResults);

      const results = await speedTester.getSpeedTestHistory();

      expect(results[0].jitterMs).toBeUndefined();
      expect(results[0].serverId).toBeUndefined();
    });
  });

  describe('bytesToMbps (private method - tested via runSpeedTest)', () => {
    it.each([
      [12500000, 100], // 12.5 MB/s = 100 Mbps
      [125000000, 1000], // 125 MB/s = 1000 Mbps (1 Gbps)
      [1250000, 10], // 1.25 MB/s = 10 Mbps
      [0, 0], // 0 bytes = 0 Mbps
      [125000, 1], // 125 KB/s = 1 Mbps
    ])('should convert %d bytes/sec to %d Mbps', async (bytes, expectedMbps) => {
      const ooklaResult = createOoklaResult({
        download: { bandwidth: bytes, bytes: bytes * 10, elapsed: 10000 },
      });
      mockExecAsync.mockResolvedValue({
        stdout: JSON.stringify(ooklaResult),
        stderr: '',
      });

      const result = await speedTester.runSpeedTest();

      expect(result?.downloadMbps).toBeCloseTo(expectedMbps, 1);
    });
  });
});
