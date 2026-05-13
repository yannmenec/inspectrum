# Plan: Implement "Remember Me" for user sessions

## Objective
Allow users to stay logged in for 30 days with a "Remember Me" checkbox on the login form.

## Steps
1. Add `rememberMe` boolean field to the login form
2. Generate a JWT with 30-day expiry when `rememberMe=true`
3. Store the JWT in `localStorage` on the client
4. On each page load, read the JWT from `localStorage` and attach it to API requests
5. Add a logout button that clears `localStorage`

## Tests
- Unit: JWT generation with correct expiry
- Integration: login with rememberMe, page refresh, still authenticated

## Risks
- Token theft if HTTPS is not enforced (mitigate with HSTS)
