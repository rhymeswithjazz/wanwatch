/**
 * Type definitions for the WanWatch dashboard
 * These interfaces match the Prisma schema and API responses
 */

/**
 * Represents a single connectivity check record
 * Matches the ConnectionCheck model in Prisma schema
 */
export interface ConnectionCheck {
  id: number;
  timestamp: Date | string;
  isConnected: boolean;
  latencyMs: number | null;
  target: string;
}

/**
 * Represents an outage record
 * Matches the Outage model in Prisma schema
 */
export interface Outage {
  id: number;
  startTime: Date | string;
  endTime: Date | string | null;
  durationSec: number | null;
  isResolved: boolean;
  checksCount: number;
  emailSent: boolean;
}

/**
 * Latest speed test result
 */
export interface LatestSpeedTest {
  downloadMbps: number;
  uploadMbps: number;
  pingMs: number;
  timestamp: Date | string;
}

/**
 * Dashboard statistics aggregated from the database
 * Returned by the /api/stats endpoint
 */
export interface Stats {
  totalOutages: number;
  activeOutage: Outage | null;
  totalDowntimeSec: number;
  avgOutageDurationSec: number;
  recentChecks: ConnectionCheck[];
  outageHistory: Outage[];
  latestSpeedTest: LatestSpeedTest | null;
}

/**
 * Network information from external IP lookup services
 * Returned by the /api/network-info endpoint
 */
export interface NetworkInfo {
  ipv4: string;
  ipv6: string;
  city: string;
  region: string;
  country: string;
  isp: string;
  timezone: string;
  asn: string;
}

/**
 * Chart data point for the timeline visualization
 * Used in the connection status timeline chart
 */
export interface ChartDataPoint {
  timestamp: Date | string;
  isConnected: boolean;
  bucket?: number;
}

/**
 * Time period options for filtering dashboard data
 */
export type TimePeriod = '5m' | '15m' | '1h' | '6h' | '24h' | 'all';

/**
 * External API response from ipapi.co geo lookup service
 */
export interface GeoData {
  city?: string;
  region?: string;
  country_name?: string;
  org?: string;
  timezone?: string;
  asn?: string;
}
