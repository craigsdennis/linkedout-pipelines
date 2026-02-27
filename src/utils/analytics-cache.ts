/**
 * Analytics Data Cache with Stale-While-Revalidate
 *
 * Caches R2 SQL analytics query results in KV to avoid slow queries on every page load.
 * Uses the same SWR pattern as map-data.ts:
 *   - Fresh cache (< STALE_THRESHOLD): return immediately
 *   - Stale cache (>= STALE_THRESHOLD): return immediately, kick off background refresh via waitUntil
 *   - No cache: query R2 SQL synchronously, store result, return
 *
 * Cache keys:
 *   - Per-slug (shared across maintainers): "analytics:slug:{slug}"
 *   - Per-user aggregate: "analytics:user:{email}"
 */

import { env, waitUntil } from "cloudflare:workers";
import { getOutie, getUserAccessibleSlugs } from "./db";
import { queryR2SQL } from "./r2-sql";

const STALE_THRESHOLD_SECONDS = 120; // 2 minutes

// ==================== Types ====================

export interface AnalyticsStats {
	totalViews: number;
	totalClicks: number;
	totalQrScans: number;
	clickThroughRate: string;
}

export interface DestinationItem {
	out: string;
	click_count: number;
}

export interface LinkTextItem {
	link_text: string;
	out: string;
	click_count: number;
}

export interface SlugItem {
	slug: string;
	title: string | null;
	click_count: number;
}

export interface CachedAnalytics {
	stats: AnalyticsStats;
	recentEvents: any[];
	destinationBreakdown: DestinationItem[];
	linkTextBreakdown: LinkTextItem[];
	slugBreakdown: SlugItem[];
	hasData: boolean;
	lastUpdated: string;
}

export interface AnalyticsResult {
	data: CachedAnalytics;
	fromCache: boolean;
	errorMessage: string | null;
}

// ==================== Cache Key Helpers ====================

function slugCacheKey(slug: string): string {
	return `analytics:slug:${slug}`;
}

function userCacheKey(email: string): string {
	return `analytics:user:${email}`;
}

// ==================== Public API ====================

/**
 * Get analytics data with stale-while-revalidate caching.
 *
 * @param email - Authenticated user's email (used for access control and aggregate cache key)
 * @param slugFilter - Optional slug to filter by (uses per-slug shared cache)
 * @returns Analytics data, cache status, and any error message
 */
export async function getAnalyticsData(
	email: string,
	slugFilter?: string,
): Promise<AnalyticsResult> {
	const cacheKey = slugFilter
		? slugCacheKey(slugFilter)
		: userCacheKey(email);

	try {
		// Try cache first
		const cached = await env.MAP_CACHE.get<CachedAnalytics>(
			cacheKey,
			"json",
		);

		if (cached && cached.lastUpdated) {
			const cacheAge =
				Date.now() - new Date(cached.lastUpdated).getTime();
			const isStale = cacheAge >= STALE_THRESHOLD_SECONDS * 1000;

			if (isStale) {
				console.log(
					`Analytics cache stale for ${cacheKey}, age: ${Math.round(cacheAge / 1000)}s. Background refresh triggered.`,
				);
				waitUntil(refreshAnalyticsCache(email, slugFilter));
			} else {
				console.log(
					`Analytics cache fresh for ${cacheKey}, age: ${Math.round(cacheAge / 1000)}s`,
				);
			}

			return { data: cached, fromCache: true, errorMessage: null };
		}

		// No cache — query synchronously
		console.log(`Analytics cache miss for ${cacheKey}, querying R2 SQL`);
		const data = await queryAnalytics(email, slugFilter);
		await env.MAP_CACHE.put(cacheKey, JSON.stringify(data));

		return { data, fromCache: false, errorMessage: null };
	} catch (error) {
		console.error("Error in getAnalyticsData:", error);
		const errorMessage =
			error instanceof Error
				? error.message
				: "Unknown error querying analytics";

		return {
			data: emptyAnalytics(),
			fromCache: false,
			errorMessage,
		};
	}
}

/**
 * Refresh the analytics cache for a given key.
 * Called in the background via waitUntil, or manually.
 */
export async function refreshAnalyticsCache(
	email: string,
	slugFilter?: string,
): Promise<CachedAnalytics> {
	const cacheKey = slugFilter
		? slugCacheKey(slugFilter)
		: userCacheKey(email);

	console.log(`Refreshing analytics cache for ${cacheKey}`);
	const data = await queryAnalytics(email, slugFilter);
	await env.MAP_CACHE.put(cacheKey, JSON.stringify(data));
	return data;
}

// ==================== Query Logic ====================

/**
 * Build the WHERE clause for R2 SQL based on slug filter or user's accessible slugs.
 * This is separated so access control always runs fresh (never cached).
 */
async function buildWhereClause(
	email: string,
	slugFilter?: string,
): Promise<string> {
	if (slugFilter) {
		return `WHERE slug = '${slugFilter}'`;
	}

	const userSlugs = await getUserAccessibleSlugs(email);
	console.log("User accessible slugs:", userSlugs);

	if (userSlugs.length === 0) {
		return "WHERE slug = 'nonexistent'";
	}

	const slugConditions = userSlugs
		.map((s) => `slug = '${s}'`)
		.join(" OR ");
	return `WHERE (${slugConditions})`;
}

/**
 * Execute all analytics R2 SQL queries and process results.
 */
async function queryAnalytics(
	email: string,
	slugFilter?: string,
): Promise<CachedAnalytics> {
	const whereClause = await buildWhereClause(email, slugFilter);
	console.log("Analytics WHERE clause:", whereClause);

	// Define all queries
	const statsQuery = `
		SELECT 
			event_type,
			COUNT(*)
		FROM default.events
		${whereClause}
		GROUP BY event_type
	`;

	const eventsQuery = `
		SELECT 
			timestamp,
			event_type,
			slug,
			out,
			link_text,
			city,
			region,
			country
		FROM default.events
		${whereClause}
		ORDER BY __ingest_ts DESC
		LIMIT 20
	`;

	const destinationQuery = `
		SELECT 
			out,
			COUNT(*)
		FROM default.events
		${whereClause}
			AND event_type = 'click'
			AND out IS NOT NULL
		GROUP BY out
		ORDER BY COUNT(*) DESC
	`;

	const linkTextQuery = `
		SELECT 
			link_text,
			out,
			COUNT(*)
		FROM default.events
		${whereClause}
			AND event_type = 'click'
			AND link_text IS NOT NULL
			AND out IS NOT NULL
		GROUP BY link_text, out
		ORDER BY COUNT(*) DESC
	`;

	const slugQuery = !slugFilter
		? `
		SELECT 
			slug,
			COUNT(*)
		FROM default.events
		${whereClause}
			AND event_type = 'click'
		GROUP BY slug
		ORDER BY COUNT(*) DESC
	`
		: null;

	// Execute all queries in parallel
	const [statsData, eventsData, destinationData, linkTextData, slugData] =
		await Promise.all([
			queryR2SQL(statsQuery),
			queryR2SQL(eventsQuery),
			queryR2SQL(destinationQuery),
			queryR2SQL(linkTextQuery),
			slugQuery
				? queryR2SQL(slugQuery)
				: Promise.resolve({ result: { rows: [] } }),
		]);

	console.log("All analytics queries completed in parallel");

	// Process stats
	const stats: AnalyticsStats = {
		totalViews: 0,
		totalClicks: 0,
		totalQrScans: 0,
		clickThroughRate: "0%",
	};
	let hasData = false;

	const rows = statsData.result?.rows;
	if (rows && rows.length > 0) {
		hasData = true;
		rows.forEach((row: any) => {
			const count = row["count(*)"] || 0;
			if (row.event_type === "page_view") stats.totalViews = count;
			if (row.event_type === "click") stats.totalClicks = count;
			if (row.event_type === "qr_scan") stats.totalQrScans = count;
		});

		if (stats.totalViews > 0) {
			const ctr = ((stats.totalClicks / stats.totalViews) * 100).toFixed(
				1,
			);
			stats.clickThroughRate = `${ctr}%`;
		}
	}

	// Process recent events
	const recentEvents: any[] = eventsData.result?.rows || [];

	// Process destination breakdown
	const destRows = destinationData.result?.rows;
	const destinationBreakdown: DestinationItem[] = destRows
		? destRows
				.map((row: any) => ({
					out: row.out,
					click_count: row["count(*)"] || row.click_count || 0,
				}))
				.sort(
					(a: DestinationItem, b: DestinationItem) =>
						b.click_count - a.click_count,
				)
				.slice(0, 20)
		: [];

	// Process link text breakdown
	const linkRows = linkTextData.result?.rows;
	const linkTextBreakdown: LinkTextItem[] = linkRows
		? linkRows
				.map((row: any) => ({
					link_text: row.link_text,
					out: row.out,
					click_count: row["count(*)"] || row.click_count || 0,
				}))
				.sort(
					(a: LinkTextItem, b: LinkTextItem) =>
						b.click_count - a.click_count,
				)
				.slice(0, 20)
		: [];

	// Process slug breakdown (only for aggregate view)
	let slugBreakdown: SlugItem[] = [];
	const slugRows = slugData.result?.rows;
	if (slugRows && slugRows.length > 0) {
		const slugsWithTitles = await Promise.all(
			slugRows.map(async (row: any) => {
				const outie = await getOutie(row.slug);
				return {
					slug: row.slug,
					title: outie?.title || null,
					click_count: row["count(*)"] || 0,
				};
			}),
		);

		slugBreakdown = slugsWithTitles
			.sort((a, b) => b.click_count - a.click_count)
			.slice(0, 20);
	}

	return {
		stats,
		recentEvents,
		destinationBreakdown,
		linkTextBreakdown,
		slugBreakdown,
		hasData,
		lastUpdated: new Date().toISOString(),
	};
}

// ==================== Helpers ====================

function emptyAnalytics(): CachedAnalytics {
	return {
		stats: {
			totalViews: 0,
			totalClicks: 0,
			totalQrScans: 0,
			clickThroughRate: "0%",
		},
		recentEvents: [],
		destinationBreakdown: [],
		linkTextBreakdown: [],
		slugBreakdown: [],
		hasData: false,
		lastUpdated: new Date().toISOString(),
	};
}
