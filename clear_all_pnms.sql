-- ==============================================================================
-- Single-Use Script: Purge All PNMs and Voting/Feedback Data
-- System: Rush Management Tool (RMT)
-- Description:
--   Completely wipes all Potential New Member (PNM) data, feedback, review
--   splits, member votes, and voting tally tables, and resets the voting-ops
--   operational state to its initial clean state.
--
--   NOTE ON HEADSHOT PHOTOS:
--     Supabase protects the `storage.objects` table with a trigger to prevent
--     orphaned files in cloud storage. To delete the uploaded photos, go to:
--     Supabase Dashboard -> Storage -> 'pnm-headshots' -> Click "..." -> "Empty bucket".
--
--   PRESERVES:
--     - Member profiles (public.profiles) and auth accounts (auth.users)
--     - Voting threshold rules and configuration (public."voting-thresholds")
-- ==============================================================================

BEGIN;

-- 1. Truncate PNM Review Splits (Rush Committee split codes)
DO $$
BEGIN
    IF to_regclass('public.pnm_review_splits') IS NOT NULL THEN
        TRUNCATE TABLE public.pnm_review_splits RESTART IDENTITY CASCADE;
        RAISE NOTICE 'Cleared public.pnm_review_splits';
    END IF;
END $$;

-- 2. Truncate PNM Feedback (comments, positive/constructive feedback, quick feedback)
DO $$
BEGIN
    IF to_regclass('public.pnm_feedback') IS NOT NULL THEN
        TRUNCATE TABLE public.pnm_feedback RESTART IDENTITY CASCADE;
        RAISE NOTICE 'Cleared public.pnm_feedback';
    END IF;
END $$;

-- 3. Truncate Member Votes (individual votes cast by fraternity members)
DO $$
BEGIN
    IF to_regclass('public.member_votes') IS NOT NULL THEN
        TRUNCATE TABLE public.member_votes RESTART IDENTITY CASCADE;
        RAISE NOTICE 'Cleared public.member_votes';
    END IF;
END $$;

-- 4. Truncate all voting tally tables (voting-s1-r1, voting-s1-r2, voting-s2-r1, etc., plus any legacy voting-r* tables)
DO $$
DECLARE
    tbl text;
BEGIN
    FOR tbl IN
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND (
            table_name ~ '^voting-s[0-9]-r[0-9]$'
            OR table_name ~ '^voting-r[0-9]$'
          )
    LOOP
        EXECUTE format('TRUNCATE TABLE public.%I CASCADE', tbl);
        RAISE NOTICE 'Cleared public.%', tbl;
    END LOOP;
END $$;

-- 5. Truncate the main PNMs table (student_id, full_name, email, attendance, etc.)
DO $$
BEGIN
    IF to_regclass('public.pnms') IS NOT NULL THEN
        TRUNCATE TABLE public.pnms RESTART IDENTITY CASCADE;
        RAISE NOTICE 'Cleared public.pnms';
    END IF;
END $$;

-- 6. Reset operational voting control state in public."voting-ops"
DO $$
BEGIN
    IF to_regclass('public."voting-ops"') IS NOT NULL THEN
        UPDATE public."voting-ops"
        SET
            section = 1,
            round = 1,
            round_status = 'idle',
            voting_status = 'closed',
            active_pnm_id = NULL,
            pnm_order = NULL,
            closing_ends_at = NULL,
            invite_quota = NULL,
            bid_quota = NULL,
            invite_bid_list_shown = false,
            updated_at = now()
        WHERE id = 1;

        RAISE NOTICE 'Reset public."voting-ops" (id=1) to idle / clean state';
    END IF;
END $$;

COMMIT;

-- 7. Verification summary query:
SELECT 
    (SELECT count(*) FROM public.pnms) AS remaining_pnms,
    (SELECT count(*) FROM public.pnm_feedback) AS remaining_feedback,
    (SELECT count(*) FROM public.pnm_review_splits) AS remaining_splits,
    (SELECT count(*) FROM public.member_votes) AS remaining_votes,
    (SELECT active_pnm_id FROM public."voting-ops" WHERE id = 1) AS ops_active_pnm,
    (SELECT round_status FROM public."voting-ops" WHERE id = 1) AS ops_round_status;
