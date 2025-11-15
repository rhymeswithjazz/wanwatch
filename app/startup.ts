import { startMonitoring } from '@/lib/monitoring/scheduler';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

let initialized = false;

export function initializeMonitoring() {
  if (initialized) {
    logger.warn('Monitoring initialization attempted multiple times', {
      alreadyInitialized: true
    });
    return;
  }

  if (env.NODE_ENV === 'production' || env.ENABLE_MONITORING === 'true') {
    startMonitoring();
    initialized = true;
    logger.logLifecycle('monitoring_started', {
      environment: env.NODE_ENV,
      enabledExplicitly: env.ENABLE_MONITORING === 'true'
    });
  } else {
    logger.info('WAN monitoring disabled in development mode', {
      environment: env.NODE_ENV,
      hint: 'Set ENABLE_MONITORING=true to enable'
    });
  }
}
