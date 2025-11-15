import speedtest from 'speedtest-net';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';

export interface SpeedTestResult {
  downloadMbps: number;
  uploadMbps: number;
  pingMs: number;
  jitterMs?: number;
  serverId?: string;
  serverName?: string;
  serverCountry?: string;
  isp?: string;
  externalIp?: string;
  resultUrl?: string;
}

export class SpeedTester {
  private isRunning = false;

  async runSpeedTest(): Promise<SpeedTestResult | null> {
    if (this.isRunning) {
      await logger.warn('Speed test already running, skipping this interval');
      return null;
    }

    this.isRunning = true;
    logger.info('Starting speed test');

    try {
      const result = await speedtest({
        acceptLicense: true,
        acceptGdpr: true,
      });

      const speedTestResult: SpeedTestResult = {
        downloadMbps: this.bytesToMbps(result.download.bandwidth),
        uploadMbps: this.bytesToMbps(result.upload.bandwidth),
        pingMs: result.ping.latency,
        jitterMs: result.ping.jitter,
        serverId: result.server?.id?.toString(),
        serverName: result.server?.name,
        serverCountry: result.server?.country,
        isp: result.isp,
        externalIp: result.interface?.externalIp,
        resultUrl: result.result?.url,
      };

      await this.saveSpeedTestResult(speedTestResult);

      logger.info('Speed test completed', {
        download: speedTestResult.downloadMbps.toFixed(2),
        upload: speedTestResult.uploadMbps.toFixed(2),
        ping: speedTestResult.pingMs.toFixed(2),
      });

      return speedTestResult;
    } catch (error) {
      await logger.error('Speed test failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    } finally {
      this.isRunning = false;
    }
  }

  private async saveSpeedTestResult(result: SpeedTestResult): Promise<void> {
    try {
      await prisma.speedTest.create({
        data: {
          downloadMbps: result.downloadMbps,
          uploadMbps: result.uploadMbps,
          pingMs: result.pingMs,
          jitterMs: result.jitterMs,
          serverId: result.serverId,
          serverName: result.serverName,
          serverCountry: result.serverCountry,
          isp: result.isp,
          externalIp: result.externalIp,
          resultUrl: result.resultUrl,
        },
      });

      await logger.logConnectivityCheck('speed_test_saved', true);
    } catch (error) {
      await logger.error('Failed to save speed test result', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private bytesToMbps(bytes: number): number {
    // Ookla returns bytes per second, convert to megabits per second
    return (bytes * 8) / 1_000_000;
  }

  async getLatestSpeedTest(): Promise<SpeedTestResult | null> {
    try {
      const latest = await prisma.speedTest.findFirst({
        orderBy: { timestamp: 'desc' },
      });

      if (!latest) return null;

      return {
        downloadMbps: latest.downloadMbps,
        uploadMbps: latest.uploadMbps,
        pingMs: latest.pingMs,
        jitterMs: latest.jitterMs ?? undefined,
        serverId: latest.serverId ?? undefined,
        serverName: latest.serverName ?? undefined,
        serverCountry: latest.serverCountry ?? undefined,
        isp: latest.isp ?? undefined,
        externalIp: latest.externalIp ?? undefined,
        resultUrl: latest.resultUrl ?? undefined,
      };
    } catch (error) {
      await logger.error('Failed to get latest speed test', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async getSpeedTestHistory(limit: number = 100): Promise<SpeedTestResult[]> {
    try {
      const results = await prisma.speedTest.findMany({
        orderBy: { timestamp: 'desc' },
        take: limit,
      });

      return results.map((r) => ({
        downloadMbps: r.downloadMbps,
        uploadMbps: r.uploadMbps,
        pingMs: r.pingMs,
        jitterMs: r.jitterMs ?? undefined,
        serverId: r.serverId ?? undefined,
        serverName: r.serverName ?? undefined,
        serverCountry: r.serverCountry ?? undefined,
        isp: r.isp ?? undefined,
        externalIp: r.externalIp ?? undefined,
        resultUrl: r.resultUrl ?? undefined,
      }));
    } catch (error) {
      await logger.error('Failed to get speed test history', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }
}
