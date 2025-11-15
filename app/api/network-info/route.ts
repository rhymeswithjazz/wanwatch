import { NextResponse } from 'next/server';
import { NetworkInfo, GeoData } from '@/types/dashboard';
import { env } from '@/lib/env';
import { logger } from '@/lib/logger';

// ip-api.com response type
interface IpApiResponse {
  status: 'success' | 'fail';
  message?: string;
  city?: string;
  region?: string;
  country?: string;
  org?: string;
  timezone?: string;
  as?: string;
}

// Cache the network info to avoid hitting rate limits
let cachedNetworkInfo: NetworkInfo | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION_MS = parseInt(env.NETWORK_INFO_CACHE_SECONDS || '600') * 1000;
const FETCH_TIMEOUT = 5000; // 5 seconds

export async function GET() {
  const startTime = Date.now();

  try {
    const now = Date.now();

    // Return cached data if it's still valid
    if (cachedNetworkInfo && (now - cacheTimestamp) < CACHE_DURATION_MS) {
      const cacheAge = Math.round((now - cacheTimestamp) / 1000);
      logger.debug('Returning cached network info', { cacheAgeSeconds: cacheAge });

      const duration = Date.now() - startTime;
      await logger.logRequest('GET', '/api/network-info', 200, duration, {
        cached: true,
        cacheAgeSeconds: cacheAge
      });

      return NextResponse.json(cachedNetworkInfo, {
        headers: {
          // Cache for 10 minutes, allow stale for 20 minutes while revalidating
          'Cache-Control': 'private, max-age=600, stale-while-revalidate=1200',
        },
      });
    }

    logger.debug('Fetching fresh network info from external APIs');

    // Fetch IPv4 and IPv6 addresses separately, plus geo info
    // Using ip-api.com for geolocation (better rate limits: 45 req/min vs ipapi.co's daily limits)
    // Note: ip-api.com free tier only supports HTTP (HTTPS requires paid plan)
    const [ipv4Response, ipv6Response, geoResponse] = await Promise.allSettled([
      fetch('https://api.ipify.org?format=json', {
        cache: 'no-store',
        signal: AbortSignal.timeout(FETCH_TIMEOUT)
      }),
      fetch('https://api6.ipify.org?format=json', {
        cache: 'no-store',
        signal: AbortSignal.timeout(FETCH_TIMEOUT)
      }),
      fetch('http://ip-api.com/json/?fields=status,message,city,region,country,org,timezone,as', {
        cache: 'no-store',
        signal: AbortSignal.timeout(FETCH_TIMEOUT)
      })
    ]);

    let ipv4 = 'N/A';
    let ipv6 = 'N/A';
    let geoData: Partial<GeoData> = {};

    // Get IPv4
    if (ipv4Response.status === 'fulfilled' && ipv4Response.value.ok) {
      const data = await ipv4Response.value.json();
      ipv4 = data.ip || 'N/A';
    }

    // Get IPv6
    if (ipv6Response.status === 'fulfilled' && ipv6Response.value.ok) {
      const data = await ipv6Response.value.json();
      ipv6 = data.ip || 'N/A';
    }

    // Get geo info from ip-api.com
    if (geoResponse.status === 'fulfilled' && geoResponse.value.ok) {
      const rawGeoData: IpApiResponse = await geoResponse.value.json();

      // ip-api.com uses different field names, so normalize them
      if (rawGeoData.status === 'success') {
        geoData = {
          city: rawGeoData.city,
          region: rawGeoData.region, // This is the state code (e.g., "GA")
          country_name: rawGeoData.country,
          org: rawGeoData.org,
          timezone: rawGeoData.timezone,
          asn: rawGeoData.as
        };
        logger.debug('Geo data fetched successfully', {
          city: geoData.city,
          region: geoData.region,
          country: geoData.country_name
        });
      } else {
        await logger.warn('Geo API returned error', { error: rawGeoData.message });
        if (cachedNetworkInfo) {
          logger.debug('Using cached geo data due to API error');
          geoData = cachedNetworkInfo;
        }
      }
    } else {
      if (geoResponse.status === 'rejected') {
        await logger.error('Geo fetch rejected', {
          error: geoResponse.reason instanceof Error ? geoResponse.reason.message : String(geoResponse.reason)
        });
      } else if (geoResponse.status === 'fulfilled' && !geoResponse.value.ok) {
        const errorText = await geoResponse.value.text();
        await logger.error('Geo fetch failed', {
          status: geoResponse.value.status,
          statusText: geoResponse.value.statusText,
          response: errorText
        });
      }

      if (cachedNetworkInfo) {
        // If geo fetch fails but we have cache, use cached geo data
        logger.debug('Geo fetch failed, using cached geo data');
        geoData = cachedNetworkInfo;
      }
    }

    logger.debug('Network info fetched', { ipv4, ipv6 });

    // Update cache
    cachedNetworkInfo = {
      ipv4,
      ipv6,
      city: geoData.city || 'Unknown',
      region: geoData.region || 'Unknown',
      country: geoData.country_name || 'Unknown',
      isp: geoData.org || 'Unknown',
      timezone: geoData.timezone || 'Unknown',
      asn: geoData.asn || 'Unknown',
    };
    cacheTimestamp = now;

    const duration = Date.now() - startTime;
    await logger.logRequest('GET', '/api/network-info', 200, duration, {
      cached: false,
      ipv4,
      ipv6
    });

    return NextResponse.json(cachedNetworkInfo, {
      headers: {
        // Cache for 10 minutes, allow stale for 20 minutes while revalidating
        'Cache-Control': 'private, max-age=600, stale-while-revalidate=1200',
      },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const duration = Date.now() - startTime;

    await logger.error('Error in network-info API', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined
    });

    // Return stale cache if available
    if (cachedNetworkInfo) {
      logger.debug('Returning stale cache due to error');

      await logger.logRequest('GET', '/api/network-info', 200, duration, {
        cached: true,
        stale: true,
        error: errorMessage
      });

      return NextResponse.json(cachedNetworkInfo, {
        headers: {
          'Cache-Control': 'private, max-age=60, stale-while-revalidate=30',
        },
      });
    }

    await logger.logRequest('GET', '/api/network-info', 500, duration, {
      error: errorMessage
    });

    return NextResponse.json({
      error: 'Unable to fetch network information',
      details: errorMessage
    }, { status: 500 });
  }
}

// Disable static rendering for this route
export const dynamic = 'force-dynamic';
