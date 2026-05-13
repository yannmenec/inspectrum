# Plan: Add rate limiting to POST /api/v1/users

## Objective
Prevent abuse on the user creation endpoint by limiting requests to 100 per minute per IP.

## Steps
1. Install `ioredis` and `rate-limiter-flexible`
2. Create `src/middleware/rateLimiter.ts`
3. Mount middleware in `src/server.ts` before the router
4. Add tests in `tests/unit/middleware/rateLimiter.test.ts`

## Risks
- Redis downtime could block all registrations
- Proxied requests may expose wrong IPs

## Tests
- Unit: mock Redis, verify token bucket decrement logic
- E2E: send 101 requests, assert 101st returns 429

## Notes
- We should probably also handle the 429 response, maybe with some information
- X-Forwarded-For trust may need configuration
