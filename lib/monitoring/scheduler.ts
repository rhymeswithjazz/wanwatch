import { ConnectivityChecker } from './connectivity-checker';
import { SpeedTester } from './speed-tester';
import { getErrorMessage } from '@/lib/utils';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

let connectivityTask: NodeJS.Timeout | null = null;
let speedTestTask: NodeJS.Timeout | null = null;

export function startMonitoring(): void {
  if (connectivityTask) {
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

  // Run connectivity check immediately on startup
  runCheck();

  // Then run every N seconds
  connectivityTask = setInterval(runCheck, checkIntervalMs);

  logger.logLifecycle('monitoring_started', {
    intervalSeconds: checkIntervalSeconds
  });

  // Start speed test monitoring if enabled
  if (env.ENABLE_SPEED_TEST === 'true') {
    startSpeedTestMonitoring();
  }
}

function startSpeedTestMonitoring(): void {
  if (speedTestTask) {
    logger.debug('Speed test monitoring already running');
    return;
  }

  const speedTester = new SpeedTester();
  const speedTestIntervalSeconds = parseInt(env.SPEED_TEST_INTERVAL_SECONDS);
  const speedTestIntervalMs = speedTestIntervalSeconds * 1000;

  // Run speed test function
  const runSpeedTest = async () => {
    logger.debug('Running speed test...');
    try {
      await logger.withTiming('Speed test', async () => {
        await speedTester.runSpeedTest();
      });
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      await logger.error('Error during speed test', { error: errorMessage });
    }
  };

  // Run speed test after 30 seconds to allow connectivity check to complete first
  setTimeout(() => {
    runSpeedTest();
  }, 30000);

  // Then run every N seconds
  speedTestTask = setInterval(runSpeedTest, speedTestIntervalMs);

  logger.logLifecycle('speedtest_monitoring_started', {
    intervalSeconds: speedTestIntervalSeconds
  });
}

export function stopMonitoring(): void {
  if (connectivityTask) {
    clearInterval(connectivityTask);
    connectivityTask = null;
    logger.logLifecycle('monitoring_stopped');
  }

  if (speedTestTask) {
    clearInterval(speedTestTask);
    speedTestTask = null;
    logger.logLifecycle('speedtest_monitoring_stopped');
  }
}
