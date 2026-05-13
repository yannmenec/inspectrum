# Plan: Migrate Users Table to New Schema

## Objective
Rename `users.username` to `users.handle` and add a `display_name` column (nullable) to the production PostgreSQL database serving 2.4M active users.

## Migration Steps

1. Deploy new application code that reads both `username` and `handle` columns
2. Run migration script during low-traffic window (2–4 AM UTC):
   ```sql
   ALTER TABLE users ADD COLUMN handle VARCHAR(50);
   UPDATE users SET handle = username;
   ALTER TABLE users ALTER COLUMN handle SET NOT NULL;
   ALTER TABLE users DROP COLUMN username;
   ALTER TABLE users ADD COLUMN display_name VARCHAR(100);
   ```
3. Deploy final application code that only uses `handle`
4. Monitor error rates for 30 minutes

## Timeline
- Migration window: next Saturday 2–4 AM UTC

## Risks
- Users table has 12M rows, migration may take 20–30 minutes
- Column drop is irreversible

## Acceptance Criteria
- All users have a `handle` value equal to their old `username`
- Application reads/writes to `handle` column correctly
- No increase in error rate post-migration
