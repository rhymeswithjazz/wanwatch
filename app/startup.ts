import { startMonitoring } from '@/lib/monitoring/scheduler';

let initialized = false;

export function initializeMonitoring() {
  if (initialized) {
    return;
  }

  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_MONITORING === 'true') {
    startMonitoring();
    initialized = true;
    console.log('WAN monitoring initialized');
  } else {
    console.log('WAN monitoring disabled (set ENABLE_MONITORING=true to enable in development)');
  }
}
