# Plan: Add a /healthz endpoint to the Express API

## Objective
Add a simple health-check route that returns `{ status: "ok" }` with HTTP 200.

## Steps
1. Open `src/server.ts`
2. Add `app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));` before the catch-all error handler
3. Add a unit test in `tests/routes/healthz.test.ts`: assert GET /healthz returns 200 and `{ status: 'ok' }`
4. Update the README "Available endpoints" table

## Risks
- None significant; the endpoint is read-only and stateless

## Acceptance criteria
- `GET /healthz` returns HTTP 200 with `{ status: "ok" }`
- Existing tests continue to pass
- CI green
