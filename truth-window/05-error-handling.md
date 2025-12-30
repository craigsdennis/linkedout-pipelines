# Session Log: Improved Error Handling

## User Context
After discovering the analytics query issue, decided to add comprehensive error handling to help debug future issues.

---

## Problem

Analytics failures were silent - no visibility into:
- Missing environment variables
- HTTP errors
- SQL query failures
- R2 SQL API errors

---

## Solution: Multi-Layer Error Handling

### Layer 1: Environment Validation

**Added to analytics route**:
```typescript
if (!c.env.R2_API_TOKEN) {
  console.error("R2_API_TOKEN not configured - cannot query analytics");
  throw new Error("Analytics not configured");
}

if (!c.env.ACCOUNT_ID) {
  console.error("ACCOUNT_ID not configured - cannot query analytics");
  throw new Error("Analytics not configured");
}
```

**Benefit**: Catch configuration issues early

---

### Layer 2: HTTP Response Status

**Before**:
```typescript
const response = await fetch(...);
const data = await response.json();
// No error checking!
```

**After**:
```typescript
if (statsResponse.ok) {
  const data = await response.json();
  // Process data
} else {
  const errorText = await statsResponse.text();
  console.error("R2 SQL stats query failed:", statsResponse.status, errorText);
  console.error("Query was:", statsQuery);
}
```

**Benefit**: Log HTTP errors with full context

---

### Layer 3: R2 SQL API Errors

**Detection**:
```typescript
const statsData = await statsResponse.json() as {
  result?: { rows?: Array<...> },
  errors?: Array<any>
};

if (statsData.errors && statsData.errors.length > 0) {
  console.error("R2 SQL stats query errors:", JSON.stringify(statsData.errors));
  console.error("Query was:", statsQuery);
}
```

**Example Error**:
```json
{
  "errors": [{
    "code": 40010,
    "message": "iceberg table not found \"default.click_events_v3\""
  }]
}
```

**Benefit**: Catch SQL-level errors (syntax, missing tables, etc.)

---

### Layer 4: Exception Handling

**Enhanced catch block**:
```typescript
catch (error) {
  console.error("Error querying R2 SQL - exception thrown:", error);
  console.error("Error details:", {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  errorMessage = error instanceof Error ? error.message : "Unknown error";
}
```

**Benefit**: Full stack traces for debugging

---

### Layer 5: User-Facing Messages

**Added error state**:
```typescript
let errorMessage: string | null = null;
```

**Display in HTML**:
```typescript
${errorMessage ? `
  <div class="warning" style="background: #ffebee; border-color: #f44336;">
    <strong>❌ Error Loading Analytics:</strong> ${errorMessage}
    <p>Check the Worker logs for more details. Common issues:</p>
    <ul>
      <li>R2_API_TOKEN secret not configured</li>
      <li>ACCOUNT_ID environment variable missing</li>
      <li>R2 SQL API rate limits or network issues</li>
      <li>SQL query syntax errors (check console logs)</li>
    </ul>
  </div>
` : !hasData ? `
  <div class="warning">
    <strong>⚠️ No Data Yet:</strong> ...
  </div>
` : ''}
```

**Benefit**: Users see helpful guidance instead of silent failure

---

## Debug Logging

**Added throughout analytics flow**:
```typescript
// User context
console.log("Analytics page accessed by:", email, "with slug filter:", slugFilter);

// Query responses
console.log("Stats query response:", JSON.stringify(statsData));
console.log("Stats query was:", statsQuery);

// Data processing
console.log("hasData set to true, rows length:", rows.length);
console.log("recentEvents set, length:", rows.length);
```

**Benefit**: Track execution flow in logs

---

## Example Log Output

### Success Case
```
Analytics page accessed by: craig@cloudflare.com with slug filter: none
Stats query response: {"result":{"rows":[...]}}
Stats query was: SELECT event_type, COUNT(*) FROM...
hasData set to true, rows length: 2
recentEvents set, length: 5
```

### Error Case  
```
Analytics page accessed by: craig@cloudflare.com with slug filter: none
R2 SQL stats query failed: 404 {"result":null,"success":false,"errors":[{...}]}
Query was: SELECT event_type, COUNT(*) FROM default.click_events_v3...
R2 SQL stats query errors: [{"code":40010,"message":"iceberg table not found..."}]
```

---

## Debug Endpoints

### Created `/debug/r2sql`
Tests R2 SQL connectivity:
```typescript
app.get("/debug/r2sql", async (c) => {
  try {
    const testQuery = `SELECT COUNT(*) FROM default.click_events_v3`;
    const response = await fetch(...);
    const data = await response.json();
    
    return c.json({
      status: response.status,
      ok: response.ok,
      query: testQuery,
      response: data,
      hasToken: !!c.env.R2_API_TOKEN,
      hasAccountId: !!c.env.ACCOUNT_ID,
    });
  } catch (error) {
    return c.json({
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }, 500);
  }
});
```

### Created `/debug/pipeline`
Tests pipeline sending:
```typescript
app.get("/debug/pipeline", async (c) => {
  try {
    const testEvent: ClickEvent = {
      timestamp: new Date().toISOString(),
      event_type: "page_view",
      slug: "debug-test",
      owner_email: "debug@test.com",
      ...getCfProperties(c.req.raw),
    };

    await c.env.CLICK_STREAM.send([testEvent]);

    return c.json({
      success: true,
      message: "Event sent to pipeline",
      event: testEvent,
      streamId: "07a866c79b6a4ec9ae4d41bba2c93cd8",
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }, 500);
  }
});
```

---

## Testing Error Scenarios

### Missing API Token
```bash
npx wrangler secret delete R2_API_TOKEN
# Visit /analytics
# Expected: "Analytics not configured" error message
```

### Invalid SQL
```sql
-- Temporarily break query
SELECT * FROM nonexistent_table
-- Expected: Error code 40010 in logs
```

### Network Issues
```bash
# Simulate by breaking API URL
# Expected: HTTP error with status code
```

---

## Files Modified

1. `src/index.tsx` - Added error handling to analytics route
2. `src/index.tsx` - Created debug endpoints

---

## Viewing Logs

### In Development
```bash
npx wrangler dev
# Logs appear in terminal
```

### In Production
```bash
npx wrangler tail
# Real-time log streaming
```

### In Dashboard
Workers & Pages → linkedout-pipelines → Logs

---

## Benefits

1. **Faster Debugging**: Know exactly what failed and why
2. **Better Monitoring**: Catch issues before users report them
3. **User Communication**: Helpful error messages with guidance
4. **Configuration Validation**: Detect missing env vars early
5. **Query Debugging**: See exact SQL that failed

---

## Result

Errors are no longer silent. Every failure logs:
- What went wrong
- The exact query that failed
- Full context (status codes, error messages, stack traces)
- Helpful guidance for users
