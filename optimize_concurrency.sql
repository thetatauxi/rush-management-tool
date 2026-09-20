-- ==============================================================================
-- Migration: Concurrency Optimization & Database Hardening
-- Rush Management Tool (RMT)
-- ==============================================================================

-- 1. Remove member_votes from Realtime Publication
-- Member votes are private per user and never listened to in Realtime by the frontend.
-- Removing it stops Postgres WAL replication and WebSocket event flooding on every vote.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
          AND schemaname = 'public' 
          AND tablename = 'member_votes'
    ) THEN
        ALTER PUBLICATION supabase_realtime DROP TABLE public.member_votes;
        RAISE NOTICE 'Dropped public.member_votes from supabase_realtime publication';
    END IF;
END $$;

-- 2. Composite Index for cast_vote aggregation
-- cast_vote calculates:
--   SELECT COUNT(*) FILTER (...) FROM member_votes WHERE student_id = ... AND section_num = ... AND round_num = ...
-- This index enables an instant Index-Only Scan, eliminating sequential table scans under load.
CREATE INDEX IF NOT EXISTS idx_member_votes_lookup 
ON public.member_votes (student_id, section_num, round_num, vote_choice);

-- 3. Composite Index for Feedback Retrieval
-- Presentation mode and feedback feeds filter by student_id and is_approved.
CREATE INDEX IF NOT EXISTS idx_pnm_feedback_student_approved 
ON public.pnm_feedback (student_id, is_approved);

-- 4. Fast User Vote Lookup Index
-- When a user opens a round, it queries:
--   SELECT student_id, vote_choice FROM member_votes WHERE user_id = ... AND section_num = ... AND round_num = ...
CREATE INDEX IF NOT EXISTS idx_member_votes_user_round
ON public.member_votes (user_id, section_num, round_num);

-- 5. Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
