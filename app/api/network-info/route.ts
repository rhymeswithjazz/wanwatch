import { NextResponse } from 'next/server';
import { NetworkInfo, GeoData } from '@/types/dashboard';

// Cache the network info for 10 minutes to avoid hitting rate limits
let cachedNetworkInfo: NetworkInfo | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION_MS = 10 * 60 * 1000; // 10 minutes

export async function GET() {
  try {
    const now = Date.now();

    // Return cached data if it's still valid
    if (cachedNetworkInfo && (now - cacheTimestamp) < CACHE_DURATION_MS) {
      console.log('Returning cached network info (age: ' + Math.round((now - cacheTimestamp) / 1000) + 's)');
      return NextResponse.json(cachedNetworkInfo);
    }

    console.log('Fetching fresh network info...');

    // Fetch IPv4 and IPv6 addresses separately, plus geo info
    // Using ip-api.com for geolocation (better rate limits: 45 req/min vs ipapi.co's daily limits)
    const [ipv4Response, ipv6Response, geoResponse] = await Promise.allSettled([
      fetch('https://api.ipify.org?format=json', { cache: 'no-store' }),
      fetch('https://api6.ipify.org?format=json', { cache: 'no-store' }),
      fetch('http://ip-api.com/json/?fields=status,message,city,region,country,org,timezone,as', { cache: 'no-store' })
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
      const rawGeoData = await geoResponse.value.json();

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
        console.log('Geo data fetched successfully:', { city: geoData.city, region: geoData.region, country: geoData.country_name });
      } else {
        console.error('Geo API returned error:', rawGeoData.message);
        if (cachedNetworkInfo) {
          console.log('Using cached geo data');
          geoData = cachedNetworkInfo;
        }
      }
    } else {
      if (geoResponse.status === 'rejected') {
        console.error('Geo fetch rejected:', geoResponse.reason);
      } else if (geoResponse.status === 'fulfilled' && !geoResponse.value.ok) {
        console.error('Geo fetch failed with status:', geoResponse.value.status, geoResponse.value.statusText);
        const errorText = await geoResponse.value.text();
        console.error('Geo fetch error response:', errorText);
      }

      if (cachedNetworkInfo) {
        // If geo fetch fails but we have cache, use cached geo data
        console.log('Geo fetch failed, using cached geo data');
        geoData = cachedNetworkInfo;
      }
    }

    console.log('Network info fetched - IPv4:', ipv4, 'IPv6:', ipv6);

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

    return NextResponse.json(cachedNetworkInfo);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in network-info API:', errorMessage);

    // Return stale cache if available
    if (cachedNetworkInfo) {
      console.log('Returning stale cache due to error');
      return NextResponse.json(cachedNetworkInfo);
    }

    return NextResponse.json({
      error: 'Unable to fetch network information',
      details: errorMessage
    }, { status: 500 });
  }
}

// Disable static rendering for this route
export const dynamic = 'force-dynamic';
