-- ---------------------------------------------------------------------------
-- Audit log append-only enforcement ([013])
--
-- WHY THIS FILE EXISTS
-- Prisma has no schema-level way to express "reject UPDATE/DELETE on this
-- table." The application-level guarantee — src/lib/audit.ts exposes only a
-- create path, never update/delete — is necessary but not sufficient: a
-- future bug, a raw query, or a psql session could still mutate a row. This
-- trigger is the second, database-level layer: it rejects the statement
-- outright, regardless of what issued it.
--
-- HOW TO APPLY IT
-- No baseline migration exists yet for any model in this schema (see
-- 001_search_vector.sql). When the first real migration is created:
--
--   1. Run `npx prisma migrate dev --create-only --name init`.
--   2. Open the generated `prisma/migrations/<timestamp>_init/migration.sql`.
--   3. Append the two statements below to the end of that migration file
--      (after the `CREATE TABLE "audit_logs"` statement it generates).
--   4. Run `npx prisma migrate dev` to apply.
--
-- After that this file is documentation only; do not run it twice.
-- `prisma migrate` never executes files under migrations/manual/ — that
-- directory has no `migration.sql` and no checksum entry, so it is invisible
-- to the migration engine.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION reject_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION reject_audit_log_mutation();

CREATE TRIGGER audit_logs_no_delete
  BEFORE DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION reject_audit_log_mutation();
