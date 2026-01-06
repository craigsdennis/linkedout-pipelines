/**
 * Location statistics for map visualization
 */
export interface LocationStats {
  country: string;
  count: number;
  cities?: Array<{ city: string; count: number }>;
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
export async function getMapData(
  kvNamespace: KVNamespace,
  accountId: string,
  apiToken: string
): Promise<MapData> {
  // Try to get from cache first
  const cached = await kvNamespace.get<MapData>(MAP_CACHE_KEY, "json");
  if (cached && cached.lastUpdated) {
    const cacheAge = Date.now() - new Date(cached.lastUpdated).getTime();
    if (cacheAge < CACHE_TTL_SECONDS * 1000) {
      console.log("Returning cached map data, age:", Math.round(cacheAge / 1000), "seconds");
      return cached;
    }
  }

  // Cache miss or expired - query R2 SQL
  console.log("Cache miss or expired, querying R2 SQL for map data");
  const mapData = await queryLocationStats(accountId, apiToken);

  // Store in cache with metadata
  await kvNamespace.put(
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
async function queryLocationStats(accountId: string, apiToken: string): Promise<MapData> {

  if (!accountId || !apiToken) {
    console.error("Missing R2 SQL credentials");
    return {
      locations: [],
      totalViews: 0,
      lastUpdated: new Date().toISOString(),
      cacheKey: MAP_CACHE_KEY,
    };
  }

  try {
    // Query for country-level rollup
    const query = `
      SELECT 
        country,
        COUNT(*) as count
      FROM default.click_events_v6
      WHERE event_type = 'page_view' 
        AND country IS NOT NULL
        AND country != ''
      GROUP BY country
      ORDER BY count DESC
    `;

    const response = await fetch(
      `https://api.sql.cloudflarestorage.com/api/v1/accounts/${accountId}/r2-sql/query/linkedout-data-catalog`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      }
    );

    if (!response.ok) {
      console.error("R2 SQL query failed:", response.status);
      throw new Error(`R2 SQL query failed: ${response.status}`);
    }

    const data = await response.json() as {
      result?: { rows?: Array<Record<string, any>> };
      errors?: Array<any>;
    };

    if (data.errors && data.errors.length > 0) {
      console.error("R2 SQL query errors:", data.errors);
    }

    const rows = data.result?.rows || [];
    const locations: LocationStats[] = rows.map((row: any) => ({
      country: row.country,
      count: row.count || 0,
    }));

    const totalViews = locations.reduce((sum, loc) => sum + loc.count, 0);

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
export async function refreshMapDataCache(
  kvNamespace: KVNamespace,
  accountId: string,
  apiToken: string
): Promise<MapData> {
  console.log("Manually refreshing map data cache");
  const mapData = await queryLocationStats(accountId, apiToken);
  
  await kvNamespace.put(
    MAP_CACHE_KEY,
    JSON.stringify(mapData),
    { expirationTtl: CACHE_TTL_SECONDS }
  );

  return mapData;
}
