import { NextResponse } from 'next/server';

// Cache the network info for 10 minutes to avoid hitting rate limits
let cachedNetworkInfo: any = null;
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
    const [ipv4Response, ipv6Response, geoResponse] = await Promise.allSettled([
      fetch('https://api.ipify.org?format=json', { cache: 'no-store' }),
      fetch('https://api6.ipify.org?format=json', { cache: 'no-store' }),
      fetch('https://ipapi.co/json/', { cache: 'no-store' })
    ]);

    let ipv4 = 'N/A';
    let ipv6 = 'N/A';
    let geoData: any = {};

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

    // Get geo info
    if (geoResponse.status === 'fulfilled' && geoResponse.value.ok) {
      geoData = await geoResponse.value.json();
    } else if (cachedNetworkInfo) {
      // If geo fetch fails but we have cache, use cached geo data
      console.log('Geo fetch failed, using cached geo data');
      geoData = cachedNetworkInfo;
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
  } catch (error: any) {
    console.error('Error in network-info API:', error);

    // Return stale cache if available
    if (cachedNetworkInfo) {
      console.log('Returning stale cache due to error');
      return NextResponse.json(cachedNetworkInfo);
    }

    return NextResponse.json({
      error: 'Unable to fetch network information',
      details: error.message
    }, { status: 500 });
  }
}

// Disable static rendering for this route
export const dynamic = 'force-dynamic';
