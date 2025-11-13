import { exec } from 'child_process';
import { promisify } from 'util';
import { prisma } from '@/lib/db';
import { getErrorMessage } from '@/lib/utils';

const execAsync = promisify(exec);

export interface ConnectivityResult {
  isConnected: boolean;
  latencyMs: number | null;
  target: string;
  timestamp: Date;
}

export class ConnectivityChecker {
  private targets = [
    '8.8.8.8',      // Google DNS
    '1.1.1.1',      // Cloudflare DNS
    'google.com',    // Domain resolution test
    'espn.com',
    'yahoo.com',
    'bing.com',
    'duckduckgo.com',
    'reddit.com',
    'twitter.com',
    'facebook.com',
    'instagram.com',
    'youtube.com',
    'twitch.tv',
    'discord.com',
    'telegram.org',
  ];

  async checkConnection(): Promise<ConnectivityResult> {
    const timestamp = new Date();

    // Try multiple targets for reliability
    for (const target of this.targets) {
      try {
        const result = await this.pingTarget(target);
        if (result.isConnected) {
          // Log successful check
          await prisma.connectionCheck.create({
            data: {
              timestamp,
              isConnected: true,
              latencyMs: result.latencyMs,
              target
            }
          });

          return { ...result, timestamp, target };
        }
      } catch (error: unknown) {
        const errorMessage = getErrorMessage(error);
        console.error(`Failed to ping ${target}:`, errorMessage);

        await prisma.systemLog.create({
          data: {
            level: 'WARN',
            message: `Ping failed for ${target}`,
            metadata: JSON.stringify({ error: errorMessage })
          }
        }).catch(err => {
          // Don't let logging errors break the monitoring loop
          console.error('Failed to log ping error:', getErrorMessage(err));
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
      const latencyMs = match ? parseFloat(match[1]) : null;

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
      await prisma.outage.create({
        data: {
          startTime: result.timestamp,
          checksCount: 1
        }
      });

      await prisma.systemLog.create({
        data: {
          level: 'ERROR',
          message: 'WAN connection lost',
          metadata: JSON.stringify({ timestamp: result.timestamp })
        }
      });
    } else if (!result.isConnected && activeOutage) {
      // Outage continues
      await prisma.outage.update({
        where: { id: activeOutage.id },
        data: {
          checksCount: { increment: 1 }
        }
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

      await prisma.systemLog.create({
        data: {
          level: 'INFO',
          message: 'WAN connection restored',
          metadata: JSON.stringify({
            duration: durationSec,
            timestamp: result.timestamp
          })
        }
      });

      // Trigger email notification
      const { sendOutageRestoredEmail } = await import('./email-notifier');
      await sendOutageRestoredEmail(activeOutage.startTime, result.timestamp, durationSec);
    }
  }
}
