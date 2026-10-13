-- Prepared operational rollback/kill switch; requires separate authorization.
-- Preserves installed trigger, companies, profiles, Auth users and their data.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $$ BEGIN
 IF current_user<>'postgres' OR current_setting('session_replication_role')<>'origin' THEN
  RAISE EXCEPTION 'Closing signup requires trusted postgres executor';
 END IF;
END $$;
UPDATE engmarq_private.public_signup_control SET enabled=false,
 changed_at=clock_timestamp(),changed_by=current_user WHERE singleton;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM engmarq_private.public_signup_control WHERE singleton AND NOT enabled) THEN
  RAISE EXCEPTION 'Closing signup failed: gate missing';
 END IF;
END $$;
COMMIT;
