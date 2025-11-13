import { ConnectivityChecker } from './connectivity-checker';
import { getErrorMessage } from '@/lib/utils';
import { env } from '@/lib/env';

let scheduledTask: NodeJS.Timeout | null = null;

export function startMonitoring(): void {
  if (scheduledTask) {
    console.log('Monitoring already running');
    return;
  }

  const checker = new ConnectivityChecker();
  const checkIntervalSeconds = parseInt(env.CHECK_INTERVAL_SECONDS);
  const checkIntervalMs = checkIntervalSeconds * 1000;

  // Run connectivity check function
  const runCheck = async () => {
    console.log('Running connectivity check...');
    try {
      const result = await checker.checkConnection();
      await checker.handleConnectionStatus(result);
      console.log(`Check complete: ${result.isConnected ? 'CONNECTED' : 'DISCONNECTED'}`);
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      console.error('Error during connectivity check:', errorMessage);
    }
  };

  // Run immediately on startup
  runCheck();

  // Then run every N seconds
  scheduledTask = setInterval(runCheck, checkIntervalMs);

  console.log(`Monitoring started: checking every ${checkIntervalSeconds} seconds`);
}

export function stopMonitoring(): void {
  if (scheduledTask) {
    clearInterval(scheduledTask);
    scheduledTask = null;
    console.log('Monitoring stopped');
  }
}
