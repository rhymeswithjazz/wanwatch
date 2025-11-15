import { exec } from 'child_process';
import { promisify } from 'util';
import { prisma } from '@/lib/db';
import { getErrorMessage } from '@/lib/utils';
import { logger } from '@/lib/logger';

const execAsync = promisify(exec);

export interface ConnectivityResult {
  isConnected: boolean;
  latencyMs: number | null;
  target: string;
  timestamp: Date;
}

export class ConnectivityChecker {
  private targetsCache: string[] = [];
  private lastCacheUpdate = 0;
  private readonly CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Load enabled targets from database, ordered by priority
   * Uses caching to avoid database queries on every check
   */
  private async getTargets(): Promise<string[]> {
    const now = Date.now();

    // Return cached targets if still valid
    if (this.targetsCache.length > 0 && now - this.lastCacheUpdate < this.CACHE_DURATION_MS) {
      return this.targetsCache;
    }

    // Load from database
    const targets = await prisma.monitoringTarget.findMany({
      where: { isEnabled: true },
      orderBy: { priority: 'asc' },
      select: { target: true }
    });

    this.targetsCache = targets.map(t => t.target);
    this.lastCacheUpdate = now;

    logger.debug('Monitoring targets loaded from database', {
      count: this.targetsCache.length,
      targets: this.targetsCache
    });

    return this.targetsCache;
  }

  /**
   * Force refresh of targets cache
   * Useful after settings changes
   */
  public async refreshTargets(): Promise<void> {
    this.lastCacheUpdate = 0;
    await this.getTargets();
  }

  async checkConnection(): Promise<ConnectivityResult> {
    const timestamp = new Date();
    const targets = await this.getTargets();

    // Ensure we have targets to check
    if (targets.length === 0) {
      await logger.error('No enabled monitoring targets found', {
        action: 'check_connection'
      });

      return {
        isConnected: false,
        latencyMs: null,
        target: 'no-targets-configured',
        timestamp
      };
    }

    // Try multiple targets for reliability
    for (const target of targets) {
      try {
        const result = await this.pingTarget(target);
        if (result.isConnected) {
          // Log successful check to database
          await prisma.connectionCheck.create({
            data: {
              timestamp,
              isConnected: true,
              latencyMs: result.latencyMs,
              target
            }
          });

          // Log connectivity success
          await logger.logConnectivityCheck(target, true, result.latencyMs);

          return { ...result, timestamp, target };
        }
      } catch (error: unknown) {
        const errorMessage = getErrorMessage(error);

        // Log ping failure
        await logger.warn(`Ping failed for ${target}`, {
          target,
          error: errorMessage
        });
      }
    }

    // All targets failed
    await prisma.connectionCheck.create({
      data: {
        timestamp,
        isConnected: false,
        target: 'all-targets-failed'
      }
    });

    // Log connectivity failure
    await logger.logConnectivityCheck('all-targets', false, null, {
      targetsAttempted: targets.length
    });

    return {
      isConnected: false,
      latencyMs: null,
      target: 'multiple',
      timestamp
    };
  }

  private async pingTarget(target: string): Promise<{ isConnected: boolean; latencyMs: number | null }> {
    try {
      const { stdout } = await execAsync(`ping -c 1 -W 5 ${target}`);

      // Parse latency from ping output
      const match = stdout.match(/time=(\d+\.?\d*)/);
      const latencyMs = match?.[1] ? parseFloat(match[1]) : null;

      return {
        isConnected: true,
        latencyMs
      };
    } catch (error) {
      return {
        isConnected: false,
        latencyMs: null
      };
    }
  }

  async handleConnectionStatus(result: ConnectivityResult): Promise<void> {
    const activeOutage = await prisma.outage.findFirst({
      where: { isResolved: false },
      orderBy: { startTime: 'desc' }
    });

    if (!result.isConnected && !activeOutage) {
      // New outage detected
      const newOutage = await prisma.outage.create({
        data: {
          startTime: result.timestamp,
          checksCount: 1
        }
      });

      // Log critical outage event
      await logger.logOutage('started', newOutage.id.toString(), undefined, {
        timestamp: result.timestamp.toISOString()
      });
    } else if (!result.isConnected && activeOutage) {
      // Outage continues
      await prisma.outage.update({
        where: { id: activeOutage.id },
        data: {
          checksCount: { increment: 1 }
        }
      });

      logger.debug('Outage continues', {
        outageId: activeOutage.id,
        checksCount: activeOutage.checksCount + 1
      });
    } else if (result.isConnected && activeOutage) {
      // Connection restored
      const durationSec = Math.floor(
        (result.timestamp.getTime() - activeOutage.startTime.getTime()) / 1000
      );

      await prisma.outage.update({
        where: { id: activeOutage.id },
        data: {
          endTime: result.timestamp,
          durationSec,
          isResolved: true
        }
      });

      // Log outage resolution
      await logger.logOutage('resolved', activeOutage.id.toString(), durationSec, {
        startTime: activeOutage.startTime.toISOString(),
        endTime: result.timestamp.toISOString()
      });

      // Trigger email notification
      const { sendOutageRestoredEmail } = await import('./email-notifier');
      await sendOutageRestoredEmail(activeOutage.startTime, result.timestamp, durationSec);
    }
  }
}
