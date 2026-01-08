import { env } from "cloudflare:workers";
import { queryR2SQL } from "./r2-sql";

/**
 * Location statistics for map visualization
 */
export interface LocationStats {
  country: string;
  city?: string;
  region?: string;
  count: number;
  latitude?: string;
  longitude?: string;
}

/**
 * Aggregated map data with cache metadata
 */
export interface MapData {
  locations: LocationStats[];
  totalViews: number;
  lastUpdated: string;
  cacheKey: string;
}

const MAP_CACHE_KEY = "map_data_global";
const CACHE_TTL_SECONDS = 900; // 15 minutes

/**
 * Get location statistics for map visualization
 * Uses KV cache with 15-minute TTL
 */
export async function getMapData(): Promise<MapData> {
  // Try to get from cache first
  const cached = await env.MAP_CACHE.get<MapData>(MAP_CACHE_KEY, "json");
  if (cached && cached.lastUpdated) {
    const cacheAge = Date.now() - new Date(cached.lastUpdated).getTime();
    if (cacheAge < CACHE_TTL_SECONDS * 1000) {
      console.log("Returning cached map data, age:", Math.round(cacheAge / 1000), "seconds");
      return cached;
    }
  }

  // Cache miss or expired - query R2 SQL
  console.log("Cache miss or expired, querying R2 SQL for map data");
  const mapData = await queryLocationStats();

  // Store in cache with metadata
  await env.MAP_CACHE.put(
    MAP_CACHE_KEY,
    JSON.stringify(mapData),
    { expirationTtl: CACHE_TTL_SECONDS }
  );

  return mapData;
}

/**
 * Query R2 SQL for location statistics
 * Groups page_view events by country
 */
async function queryLocationStats(): Promise<MapData> {
  try {
    // Query for city-level data with lat/long (no AS aliases - R2 SQL doesn't support them)
    const query = `
      SELECT 
        country,
        city,
        region,
        COUNT(*),
        latitude,
        longitude
      FROM default.click_events_v6
      WHERE event_type = 'page_view' 
        AND country IS NOT NULL
        AND country != ''
        AND latitude IS NOT NULL
        AND longitude IS NOT NULL
      GROUP BY country, city, region, latitude, longitude
      ORDER BY COUNT(*) DESC
    `;

    console.log("Querying R2 SQL for map data...");
    const data = await queryR2SQL(query);

    console.log("R2 SQL response:", JSON.stringify(data));

    // Check for errors
    if (data.errors && data.errors.length > 0) {
      throw new Error(`R2 SQL query failed: ${JSON.stringify(data.errors)}`);
    }

    const rows = data.result?.rows || [];
    console.log(`Found ${rows.length} locations with data`);
    
    const locations: LocationStats[] = rows.map((row: any) => ({
      country: row.country,
      city: row.city,
      region: row.region,
      count: row['count(*)'] || 0, // R2 SQL doesn't support AS aliases
      latitude: row.latitude,
      longitude: row.longitude,
    }));

    const totalViews = locations.reduce((sum, loc) => sum + loc.count, 0);
    console.log(`Total views across all countries: ${totalViews}`);

    return {
      locations,
      totalViews,
      lastUpdated: new Date().toISOString(),
      cacheKey: MAP_CACHE_KEY,
    };
  } catch (error) {
    console.error("Error querying location stats:", error);
    return {
      locations: [],
      totalViews: 0,
      lastUpdated: new Date().toISOString(),
      cacheKey: MAP_CACHE_KEY,
    };
  }
}

/**
 * Manually refresh the map data cache
 * Useful for admin actions or scheduled updates
 */
export async function refreshMapDataCache(): Promise<MapData> {
  console.log("Manually refreshing map data cache");
  const mapData = await queryLocationStats();
  
  await env.MAP_CACHE.put(
    MAP_CACHE_KEY,
    JSON.stringify(mapData),
    { expirationTtl: CACHE_TTL_SECONDS }
  );

  return mapData;
}
