import { ConnectivityChecker } from './connectivity-checker';
import { getErrorMessage } from '@/lib/utils';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

let scheduledTask: NodeJS.Timeout | null = null;

export function startMonitoring(): void {
  if (scheduledTask) {
    logger.debug('Monitoring already running');
    return;
  }

  const checker = new ConnectivityChecker();
  const checkIntervalSeconds = parseInt(env.CHECK_INTERVAL_SECONDS);
  const checkIntervalMs = checkIntervalSeconds * 1000;

  // Run connectivity check function
  const runCheck = async () => {
    logger.debug('Running connectivity check...');
    try {
      const result = await logger.withTiming(
        'Connectivity check',
        async () => {
          const res = await checker.checkConnection();
          await checker.handleConnectionStatus(res);
          return res;
        }
      );
      logger.debug(`Check complete: ${result.isConnected ? 'CONNECTED' : 'DISCONNECTED'}`, {
        isConnected: result.isConnected,
        target: result.target,
        latencyMs: result.latencyMs
      });
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      await logger.error('Error during connectivity check', { error: errorMessage });
    }
  };

  // Run immediately on startup
  runCheck();

  // Then run every N seconds
  scheduledTask = setInterval(runCheck, checkIntervalMs);

  logger.logLifecycle('monitoring_started', {
    intervalSeconds: checkIntervalSeconds
  });
}

export function stopMonitoring(): void {
  if (scheduledTask) {
    clearInterval(scheduledTask);
    scheduledTask = null;
    logger.logLifecycle('monitoring_stopped');
  }
}
