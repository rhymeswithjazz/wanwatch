import { ConnectivityChecker } from './connectivity-checker';
import { SpeedTester } from './speed-tester';
import { getErrorMessage } from '@/lib/utils';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { getMonitoringIntervals } from '@/lib/settings';

// Timing constants
const SPEED_TEST_STARTUP_DELAY_MS = 30000; // 30 seconds - allow connectivity check to complete first
const RESTART_CLEANUP_DELAY_MS = 100; // 100ms - ensure cleanup before restart

let connectivityTask: NodeJS.Timeout | null = null;
let speedTestTask: NodeJS.Timeout | null = null;
let currentCheckInterval: number = 0;
let currentOutageInterval: number = 0;
let isOutageMode: boolean = false;

/**
 * Creates a connectivity check function with adaptive mode switching
 * @param checker The ConnectivityChecker instance to use
 * @returns An async function that performs the connectivity check
 */
function createConnectivityCheckFunction(checker: ConnectivityChecker): () => Promise<void> {
  return async () => {
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
}

export async function startMonitoring(): Promise<void> {
  if (connectivityTask) {
    logger.debug('Monitoring already running');
    return;
  }

  // Load intervals from database or env vars
  const intervals = await getMonitoringIntervals();
  currentCheckInterval = intervals.checkIntervalSeconds * 1000;
  currentOutageInterval = intervals.outageCheckIntervalSeconds * 1000;
  isOutageMode = false;

  const checker = new ConnectivityChecker();

  // Create connectivity check function
  const runCheck = createConnectivityCheckFunction(checker);

  // Run connectivity check immediately on startup
  runCheck();

  // Then run every N seconds
  connectivityTask = setInterval(runCheck, currentCheckInterval);

  logger.logLifecycle('monitoring_started', {
    intervalSeconds: intervals.checkIntervalSeconds,
    outageIntervalSeconds: intervals.outageCheckIntervalSeconds
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

  // Run speed test after delay to allow connectivity check to complete first
  setTimeout(() => {
    runSpeedTest();
  }, SPEED_TEST_STARTUP_DELAY_MS);

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
    newIntervalSeconds: currentOutageInterval / 1000
  });

  isOutageMode = true;
  restartConnectivityMonitoring();
}

function switchToNormalMode(): void {
  if (!isOutageMode) return;

  logger.info('Switching to normal mode - restoring regular check frequency', {
    previousIntervalSeconds: currentOutageInterval / 1000,
    newIntervalSeconds: currentCheckInterval / 1000
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
  const intervalMs = isOutageMode ? currentOutageInterval : currentCheckInterval;

  // Get checker instance
  const checker = new ConnectivityChecker();

  // Create connectivity check function
  const runCheck = createConnectivityCheckFunction(checker);

  // Restart interval with new frequency
  connectivityTask = setInterval(runCheck, intervalMs);

  logger.debug('Connectivity monitoring restarted', {
    intervalSeconds: intervalMs / 1000,
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

/**
 * Restart monitoring with updated settings
 * Used when settings are changed via the UI
 */
export async function restartMonitoring(): Promise<void> {
  logger.info('Restarting monitoring with updated settings');

  // Stop current monitoring
  stopMonitoring();

  // Wait a moment to ensure cleanup
  await new Promise(resolve => setTimeout(resolve, RESTART_CLEANUP_DELAY_MS));

  // Start with new settings
  await startMonitoring();

  logger.info('Monitoring restarted successfully');
}
