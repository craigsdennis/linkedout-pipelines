/**
 * R2 SQL Query Utility
 * Centralizes R2 SQL API calls with consistent error handling
 * Uses global env for credentials (consistent with database pattern)
 */

import { env } from "cloudflare:workers";

export interface R2SQLResponse {
  result?: {
    rows?: Array<Record<string, any>>;
  };
  errors?: Array<any>;
}

/**
 * Query R2 SQL Data Catalog
 * 
 * @param query - SQL query string to execute
 * @returns R2 SQL response with rows or errors
 * 
 * @example
 * const result = await queryR2SQL(
 *   'SELECT COUNT(*) FROM default.events WHERE event_type = "page_view"'
 * );
 * 
 * if (result.result?.rows) {
 *   const count = result.result.rows[0]['count(*)'];
 * }
 */
export async function queryR2SQL(query: string): Promise<R2SQLResponse> {
  const accountId = env.ACCOUNT_ID;
  const apiToken = env.R2_API_TOKEN;

  if (!accountId || !apiToken) {
    console.error("Missing R2 SQL credentials (ACCOUNT_ID or R2_API_TOKEN)");
    return { errors: [{ message: "Missing credentials" }] };
  }

  try {
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
      const errorText = await response.text();
      console.error("R2 SQL query failed:", response.status, errorText);
      return {
        errors: [{ 
          message: `R2 SQL query failed: ${response.status}`,
          details: errorText 
        }]
      };
    }

    const data = await response.json() as R2SQLResponse;

    // Log errors if present
    if (data.errors && data.errors.length > 0) {
      console.error("R2 SQL query returned errors:", JSON.stringify(data.errors));
    }

    return data;
  } catch (error) {
    console.error("R2 SQL query exception:", error);
    return {
      errors: [{ 
        message: "Query execution failed",
        details: error instanceof Error ? error.message : String(error)
      }]
    };
  }
}
