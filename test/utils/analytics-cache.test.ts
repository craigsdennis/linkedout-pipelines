/**
 * Analytics Cache Tests
 * Tests the stale-while-revalidate KV caching layer for analytics data.
 *
 * Uses @cloudflare/vitest-pool-workers for real KV testing.
 * Note: R2 SQL queries are not available in the test environment, so we test
 * the caching layer directly by reading/writing KV entries and verifying
 * the staleness logic, cache key structure, and data shapes.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import type { CachedAnalytics } from "../../src/utils/analytics-cache";

// Cache key helpers (mirroring the module's internal logic)
function slugCacheKey(slug: string): string {
	return `analytics:slug:${slug}`;
}

function userCacheKey(email: string): string {
	return `analytics:user:${email}`;
}

function makeCachedAnalytics(
	overrides: Partial<CachedAnalytics> = {},
): CachedAnalytics {
	return {
		stats: {
			totalViews: 100,
			totalClicks: 25,
			totalQrScans: 5,
			clickThroughRate: "25.0%",
		},
		recentEvents: [
			{
				timestamp: "2026-02-26T10:00:00Z",
				event_type: "page_view",
				slug: "my-outie",
				out: null,
				link_text: null,
				city: "Austin",
				region: "TX",
				country: "US",
			},
		],
		destinationBreakdown: [
			{ out: "https://example.com", click_count: 15 },
			{ out: "https://other.com", click_count: 10 },
		],
		linkTextBreakdown: [
			{
				link_text: "My Link",
				out: "https://example.com",
				click_count: 15,
			},
		],
		slugBreakdown: [],
		hasData: true,
		lastUpdated: new Date().toISOString(),
		...overrides,
	};
}

describe("Analytics Cache - Integration Tests", () => {
	let kv: KVNamespace;

	beforeEach(async () => {
		kv = env.MAP_CACHE;

		// Clear all analytics cache keys between tests
		const list = await kv.list({ prefix: "analytics:" });
		for (const key of list.keys) {
			await kv.delete(key.name);
		}
	});

	describe("Cache Key Structure", () => {
		it("should use analytics:slug:{slug} for per-slug cache", () => {
			expect(slugCacheKey("my-outie")).toBe("analytics:slug:my-outie");
			expect(slugCacheKey("another-page")).toBe(
				"analytics:slug:another-page",
			);
		});

		it("should use analytics:user:{email} for per-user aggregate cache", () => {
			expect(userCacheKey("alice@example.com")).toBe(
				"analytics:user:alice@example.com",
			);
		});

		it("should not collide with map cache key", () => {
			const mapKey = "map_data_global";
			expect(slugCacheKey("my-outie")).not.toBe(mapKey);
			expect(userCacheKey("user@example.com")).not.toBe(mapKey);
		});
	});

	describe("KV Cache Read/Write", () => {
		it("should store and retrieve cached analytics for a slug", async () => {
			const data = makeCachedAnalytics();
			const key = slugCacheKey("test-slug");

			await kv.put(key, JSON.stringify(data));
			const cached = await kv.get<CachedAnalytics>(key, "json");

			expect(cached).not.toBeNull();
			expect(cached!.stats.totalViews).toBe(100);
			expect(cached!.stats.totalClicks).toBe(25);
			expect(cached!.stats.clickThroughRate).toBe("25.0%");
			expect(cached!.hasData).toBe(true);
			expect(cached!.destinationBreakdown).toHaveLength(2);
			expect(cached!.linkTextBreakdown).toHaveLength(1);
			expect(cached!.recentEvents).toHaveLength(1);
		});

		it("should store and retrieve cached analytics for a user aggregate", async () => {
			const data = makeCachedAnalytics({
				slugBreakdown: [
					{ slug: "outie-a", title: "Outie A", click_count: 20 },
					{ slug: "outie-b", title: "Outie B", click_count: 5 },
				],
			});
			const key = userCacheKey("user@example.com");

			await kv.put(key, JSON.stringify(data));
			const cached = await kv.get<CachedAnalytics>(key, "json");

			expect(cached).not.toBeNull();
			expect(cached!.slugBreakdown).toHaveLength(2);
			expect(cached!.slugBreakdown[0].slug).toBe("outie-a");
			expect(cached!.slugBreakdown[0].title).toBe("Outie A");
			expect(cached!.slugBreakdown[1].click_count).toBe(5);
		});

		it("should return null for missing cache key", async () => {
			const cached = await kv.get<CachedAnalytics>(
				slugCacheKey("nonexistent"),
				"json",
			);
			expect(cached).toBeNull();
		});

		it("should isolate slug caches from each other", async () => {
			const dataA = makeCachedAnalytics({
				stats: {
					totalViews: 50,
					totalClicks: 10,
					totalQrScans: 2,
					clickThroughRate: "20.0%",
				},
			});
			const dataB = makeCachedAnalytics({
				stats: {
					totalViews: 200,
					totalClicks: 80,
					totalQrScans: 15,
					clickThroughRate: "40.0%",
				},
			});

			await kv.put(slugCacheKey("slug-a"), JSON.stringify(dataA));
			await kv.put(slugCacheKey("slug-b"), JSON.stringify(dataB));

			const cachedA = await kv.get<CachedAnalytics>(
				slugCacheKey("slug-a"),
				"json",
			);
			const cachedB = await kv.get<CachedAnalytics>(
				slugCacheKey("slug-b"),
				"json",
			);

			expect(cachedA!.stats.totalViews).toBe(50);
			expect(cachedB!.stats.totalViews).toBe(200);
		});

		it("should isolate user caches from slug caches", async () => {
			const slugData = makeCachedAnalytics({
				stats: {
					totalViews: 10,
					totalClicks: 3,
					totalQrScans: 1,
					clickThroughRate: "30.0%",
				},
			});
			const userData = makeCachedAnalytics({
				stats: {
					totalViews: 999,
					totalClicks: 500,
					totalQrScans: 100,
					clickThroughRate: "50.1%",
				},
			});

			await kv.put(slugCacheKey("my-outie"), JSON.stringify(slugData));
			await kv.put(
				userCacheKey("user@example.com"),
				JSON.stringify(userData),
			);

			const cachedSlug = await kv.get<CachedAnalytics>(
				slugCacheKey("my-outie"),
				"json",
			);
			const cachedUser = await kv.get<CachedAnalytics>(
				userCacheKey("user@example.com"),
				"json",
			);

			expect(cachedSlug!.stats.totalViews).toBe(10);
			expect(cachedUser!.stats.totalViews).toBe(999);
		});
	});

	describe("Staleness Detection", () => {
		const STALE_THRESHOLD_SECONDS = 120; // 2 minutes, matching the module

		it("should detect fresh cache (less than 2 minutes old)", () => {
			const lastUpdated = new Date().toISOString();
			const cacheAge =
				Date.now() - new Date(lastUpdated).getTime();
			const isStale = cacheAge >= STALE_THRESHOLD_SECONDS * 1000;

			expect(isStale).toBe(false);
		});

		it("should detect stale cache (2 minutes or older)", () => {
			const twoMinutesAgo = new Date(
				Date.now() - STALE_THRESHOLD_SECONDS * 1000,
			).toISOString();
			const cacheAge =
				Date.now() - new Date(twoMinutesAgo).getTime();
			const isStale = cacheAge >= STALE_THRESHOLD_SECONDS * 1000;

			expect(isStale).toBe(true);
		});

		it("should detect stale cache (5 minutes old)", () => {
			const fiveMinutesAgo = new Date(
				Date.now() - 5 * 60 * 1000,
			).toISOString();
			const cacheAge =
				Date.now() - new Date(fiveMinutesAgo).getTime();
			const isStale = cacheAge >= STALE_THRESHOLD_SECONDS * 1000;

			expect(isStale).toBe(true);
		});

		it("should detect fresh cache (30 seconds old)", () => {
			const thirtySecondsAgo = new Date(
				Date.now() - 30 * 1000,
			).toISOString();
			const cacheAge =
				Date.now() - new Date(thirtySecondsAgo).getTime();
			const isStale = cacheAge >= STALE_THRESHOLD_SECONDS * 1000;

			expect(isStale).toBe(false);
		});

		it("should handle stored stale data in KV correctly", async () => {
			const staleData = makeCachedAnalytics({
				lastUpdated: new Date(
					Date.now() - 3 * 60 * 1000,
				).toISOString(), // 3 minutes ago
			});
			const key = slugCacheKey("stale-test");
			await kv.put(key, JSON.stringify(staleData));

			const cached = await kv.get<CachedAnalytics>(key, "json");
			expect(cached).not.toBeNull();

			const cacheAge =
				Date.now() - new Date(cached!.lastUpdated).getTime();
			const isStale = cacheAge >= STALE_THRESHOLD_SECONDS * 1000;

			expect(isStale).toBe(true);
			// Even though stale, the data is still valid and returned
			expect(cached!.stats.totalViews).toBe(100);
		});

		it("should handle stored fresh data in KV correctly", async () => {
			const freshData = makeCachedAnalytics({
				lastUpdated: new Date().toISOString(), // just now
			});
			const key = slugCacheKey("fresh-test");
			await kv.put(key, JSON.stringify(freshData));

			const cached = await kv.get<CachedAnalytics>(key, "json");
			expect(cached).not.toBeNull();

			const cacheAge =
				Date.now() - new Date(cached!.lastUpdated).getTime();
			const isStale = cacheAge >= STALE_THRESHOLD_SECONDS * 1000;

			expect(isStale).toBe(false);
		});
	});

	describe("CachedAnalytics Data Shape", () => {
		it("should handle empty analytics (no data yet)", async () => {
			const emptyData: CachedAnalytics = {
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

			const key = slugCacheKey("empty-outie");
			await kv.put(key, JSON.stringify(emptyData));
			const cached = await kv.get<CachedAnalytics>(key, "json");

			expect(cached!.hasData).toBe(false);
			expect(cached!.stats.totalViews).toBe(0);
			expect(cached!.recentEvents).toHaveLength(0);
			expect(cached!.destinationBreakdown).toHaveLength(0);
			expect(cached!.linkTextBreakdown).toHaveLength(0);
			expect(cached!.slugBreakdown).toHaveLength(0);
		});

		it("should preserve all fields through JSON serialization", async () => {
			const data = makeCachedAnalytics({
				recentEvents: [
					{
						timestamp: "2026-02-26T12:00:00Z",
						event_type: "click",
						slug: "my-outie",
						out: "https://example.com/link",
						link_text: "Click Me",
						city: "London",
						region: "England",
						country: "GB",
					},
				],
				slugBreakdown: [
					{
						slug: "outie-1",
						title: "My First Outie",
						click_count: 42,
					},
					{ slug: "outie-2", title: null, click_count: 7 },
				],
			});

			const key = userCacheKey("test@example.com");
			await kv.put(key, JSON.stringify(data));
			const cached = await kv.get<CachedAnalytics>(key, "json");

			// Verify event fields survive serialization
			const event = cached!.recentEvents[0];
			expect(event.event_type).toBe("click");
			expect(event.out).toBe("https://example.com/link");
			expect(event.link_text).toBe("Click Me");
			expect(event.city).toBe("London");

			// Verify slug breakdown with null title
			expect(cached!.slugBreakdown[0].title).toBe("My First Outie");
			expect(cached!.slugBreakdown[1].title).toBeNull();

			// Verify lastUpdated is a valid ISO string
			expect(() => new Date(cached!.lastUpdated)).not.toThrow();
			expect(
				new Date(cached!.lastUpdated).toISOString(),
			).toBe(cached!.lastUpdated);
		});
	});

	describe("Cache Overwrite Behavior", () => {
		it("should overwrite stale cache with fresh data", async () => {
			const key = slugCacheKey("overwrite-test");

			// Write stale data
			const staleData = makeCachedAnalytics({
				stats: {
					totalViews: 50,
					totalClicks: 10,
					totalQrScans: 2,
					clickThroughRate: "20.0%",
				},
				lastUpdated: new Date(
					Date.now() - 5 * 60 * 1000,
				).toISOString(),
			});
			await kv.put(key, JSON.stringify(staleData));

			// Verify stale data is there
			const before = await kv.get<CachedAnalytics>(key, "json");
			expect(before!.stats.totalViews).toBe(50);

			// Overwrite with fresh data (simulating background refresh)
			const freshData = makeCachedAnalytics({
				stats: {
					totalViews: 75,
					totalClicks: 20,
					totalQrScans: 4,
					clickThroughRate: "26.7%",
				},
				lastUpdated: new Date().toISOString(),
			});
			await kv.put(key, JSON.stringify(freshData));

			// Verify fresh data replaced stale
			const after = await kv.get<CachedAnalytics>(key, "json");
			expect(after!.stats.totalViews).toBe(75);
			expect(after!.stats.clickThroughRate).toBe("26.7%");
		});
	});
});
