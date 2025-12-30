# Session Log: Analytics Query Debugging

## User Request
> "The analytics page is still returning 0 I think the query isn't working"

---

## Problem Discovery

### Initial Investigation
```sql
-- Query being sent
SELECT event_type, COUNT(*) 
FROM default.click_events_v2 
GROUP BY event_type
```

**Expected Response**:
```json
{
  "data": [{...}, {...}]
}
```

**Actual Response**:
```json
{
  "result": {
    "rows": [{...}, {...}],
    "schema": [...],
    "metrics": {...}
  }
}
```

---

## Root Cause

The R2 SQL API returns data in a different structure than expected:
- We were checking for `data.data`
- Should be checking `data.result.rows`

---

## Debug Process

### Step 1: Create Debug Endpoint
```typescript
app.get("/debug/r2sql", async (c) => {
  const testQuery = `SELECT COUNT(*) FROM default.click_events_v2`;
  const response = await fetch(...);
  const data = await response.json();
  
  return c.json({
    status: response.status,
    response: data,
    hasToken: !!c.env.R2_API_TOKEN,
  });
});
```

### Step 2: Test Query
```bash
curl https://linkedout-pipelines.craigsdemos.workers.dev/debug/r2sql | jq
```

**Result**:
```json
{
  "status": 200,
  "result": {
    "rows": [{"count(*)": 10}],
    "schema": [...],
    "metrics": {...}
  }
}
```

✅ Query working, just parsing wrong!

---

## Fix Implementation

### Updated Stats Query Parsing
```typescript
// ❌ Before
if (statsData.data && statsData.data.length > 0) {
  statsData.data.forEach((row: any) => {
    // ...
  });
}

// ✅ After  
const statsData = await statsResponse.json() as {
  result?: { rows?: Array<Record<string, any>> },
  errors?: Array<any>
};

const rows = statsData.result?.rows;
if (rows && rows.length > 0) {
  rows.forEach((row: any) => {
    // ...
  });
}
```

### Updated Events Query Parsing
Same pattern applied to recent events query.

---

## Additional Issue: ORDER BY

### Discovery
```bash
# ❌ This failed
SELECT ... ORDER BY timestamp DESC

# Error: ORDER BY clause can only reference columns from partition key
```

### Fix
```sql
-- ✅ Use partition key column
SELECT ... ORDER BY __ingest_ts DESC
```

**Explanation**: R2 SQL only allows ORDER BY on partition key columns. The `__ingest_ts` column is a partition key, but `timestamp` is not.

---

## Verification

### Query Test
```bash
WRANGLER_R2_SQL_AUTH_TOKEN="..." npx wrangler r2 sql query \
  "WAREHOUSE" \
  "SELECT event_type, COUNT(*) FROM default.click_events_v2 GROUP BY event_type"
```

**Result**:
```
┌────────────┬──────────┐
│ event_type │ count(*) │
├────────────┼──────────┤
│ page_view  │ 2        │
│ click      │ 13       │
└────────────┴──────────┘
```

✅ Data exists!

### Dashboard Test
After deployment, analytics page showed:
- Total Views: 2
- Total Clicks: 13
- CTR: 650%

✅ Working!

---

## Files Modified
1. `src/index.tsx` - Response parsing (2 locations)
2. `src/index.tsx` - ORDER BY clause

---

## Deployments
1. First fix (response format): `b52842bf-8729-4d15-b97d-3a1fd7bd0066`
2. ORDER BY fix: `21abc1b7-d4e0-48ad-a965-71e961f6fc9c`

---

## Lessons Learned

1. **Always check API response format** - Don't assume structure
2. **Use debug endpoints** - Faster than checking logs
3. **R2 SQL Limitations**:
   - No `AS` aliases
   - ORDER BY only on partition keys
   - Limited LIKE patterns
4. **Access response via**: `data.result.rows` not `data.data`

---

## Documentation Added

Updated README.md with R2 SQL limitations:
```markdown
**R2 SQL Limitations**:
- ⚠️ No `AS` aliases in SQL
- ⚠️ `ORDER BY` only works on partition key columns  
- ⚠️ Limited `LIKE` patterns
```
