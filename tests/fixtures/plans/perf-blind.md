# Plan: Product Search API Endpoint

## Objective
Build a `/api/products/search` REST endpoint for the e-commerce platform's product catalog, expected to handle 500 requests/second at peak.

## Implementation

### Endpoint
`GET /api/products/search?q={query}&category={category}&min_price={price}&max_price={price}&page={n}`

### Database Query
```sql
SELECT * FROM products
WHERE name ILIKE '%' || $1 || '%'
   OR description ILIKE '%' || $1 || '%'
WHERE category = $2
  AND price BETWEEN $3 AND $4
ORDER BY created_at DESC
LIMIT 20 OFFSET ($5 - 1) * 20;
```

### Stack
- Express.js handler calling pg client directly
- Products table: 8M rows, no full-text search configured
- Response: raw SQL result rows serialized to JSON

## Deployment
- Deploy as part of next release
- No load testing planned — will monitor in production

## Acceptance Criteria
- Returns matching products with correct filters applied
- Pagination works correctly
- Response time under 2s (p99)
