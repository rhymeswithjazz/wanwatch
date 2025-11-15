import { ConnectivityChecker } from './connectivity-checker';
import { SpeedTester } from './speed-tester';
import { getErrorMessage } from '@/lib/utils';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

let connectivityTask: NodeJS.Timeout | null = null;
let speedTestTask: NodeJS.Timeout | null = null;
let currentCheckInterval: number = parseInt(env.CHECK_INTERVAL_SECONDS) * 1000;
let isOutageMode: boolean = false;

export function startMonitoring(): void {
  if (connectivityTask) {
    logger.debug('Monitoring already running');
    return;
  }

  const checker = new ConnectivityChecker();
  const checkIntervalSeconds = parseInt(env.CHECK_INTERVAL_SECONDS);
  currentCheckInterval = checkIntervalSeconds * 1000;
  isOutageMode = false;

  // Run connectivity check function
  const runCheck = async () => {
    logger.debug('Running connectivity check...', { mode: isOutageMode ? 'outage' : 'normal' });
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
        latencyMs: result.latencyMs,
        mode: isOutageMode ? 'outage' : 'normal'
      });

      // Adaptive monitoring: switch modes based on connection status
      if (!result.isConnected && !isOutageMode) {
        // Switch to outage mode (rapid checking)
        switchToOutageMode();
      } else if (result.isConnected && isOutageMode) {
        // Switch back to normal mode
        switchToNormalMode();
      }
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      await logger.error('Error during connectivity check', { error: errorMessage });
    }
  };

  // Run connectivity check immediately on startup
  runCheck();

  // Then run every N seconds
  connectivityTask = setInterval(runCheck, currentCheckInterval);

  logger.logLifecycle('monitoring_started', {
    intervalSeconds: checkIntervalSeconds,
    outageIntervalSeconds: parseInt(env.OUTAGE_CHECK_INTERVAL_SECONDS)
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

function switchToOutageMode(): void {
  if (isOutageMode) return;

  logger.info('Switching to outage mode - increasing check frequency', {
    previousIntervalSeconds: currentCheckInterval / 1000,
    newIntervalSeconds: parseInt(env.OUTAGE_CHECK_INTERVAL_SECONDS)
  });

  isOutageMode = true;
  restartConnectivityMonitoring();
}

function switchToNormalMode(): void {
  if (!isOutageMode) return;

  logger.info('Switching to normal mode - restoring regular check frequency', {
    previousIntervalSeconds: currentCheckInterval / 1000,
    newIntervalSeconds: parseInt(env.CHECK_INTERVAL_SECONDS)
  });

  isOutageMode = false;
  restartConnectivityMonitoring();
}

function restartConnectivityMonitoring(): void {
  // Clear existing interval
  if (connectivityTask) {
    clearInterval(connectivityTask);
    connectivityTask = null;
  }

  // Determine new interval based on mode
  const intervalSeconds = isOutageMode
    ? parseInt(env.OUTAGE_CHECK_INTERVAL_SECONDS)
    : parseInt(env.CHECK_INTERVAL_SECONDS);

  currentCheckInterval = intervalSeconds * 1000;

  // Get checker instance
  const checker = new ConnectivityChecker();

  // Run check function
  const runCheck = async () => {
    logger.debug('Running connectivity check...', { mode: isOutageMode ? 'outage' : 'normal' });
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
        latencyMs: result.latencyMs,
        mode: isOutageMode ? 'outage' : 'normal'
      });

      // Adaptive monitoring: switch modes based on connection status
      if (!result.isConnected && !isOutageMode) {
        // Switch to outage mode (rapid checking)
        switchToOutageMode();
      } else if (result.isConnected && isOutageMode) {
        // Switch back to normal mode
        switchToNormalMode();
      }
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      await logger.error('Error during connectivity check', { error: errorMessage });
    }
  };

  // Restart interval with new frequency
  connectivityTask = setInterval(runCheck, currentCheckInterval);

  logger.debug('Connectivity monitoring restarted', {
    intervalSeconds,
    mode: isOutageMode ? 'outage' : 'normal'
  });
}

export function stopMonitoring(): void {
  if (connectivityTask) {
    clearInterval(connectivityTask);
    connectivityTask = null;
    isOutageMode = false;
    logger.logLifecycle('monitoring_stopped');
  }

  if (speedTestTask) {
    clearInterval(speedTestTask);
    speedTestTask = null;
    logger.logLifecycle('speedtest_monitoring_stopped');
  }
}
