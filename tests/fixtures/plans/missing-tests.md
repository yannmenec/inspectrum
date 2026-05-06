# Plan: Add rate limiting to /api/v1/users

## Objective
Prevent abuse by limiting requests to 100/min per IP using a Redis token bucket.

## Steps
1. `npm install ioredis`
2. Create `src/middleware/rate-limit.ts` with token-bucket logic
3. Mount middleware in `src/server.ts` before route handlers
4. Deploy Redis on the same host

## Risks
- Redis downtime could cause all requests to fail
- X-Forwarded-For header must be trusted carefully

## Acceptance criteria
- Requests above 100/min receive HTTP 429
