-- ==============================================================================
-- Migration: Clean Unified Multi-Round Voting System
-- ==============================================================================

-- 1. Drop old & obsolete functions
DROP FUNCTION IF EXISTS public.go_live(integer);
DROP FUNCTION IF EXISTS public.go_live(integer, integer);
DROP FUNCTION IF EXISTS public.start_round(integer, integer);
DROP FUNCTION IF EXISTS public.end_round(integer, integer);
DROP FUNCTION IF EXISTS public.evaluate_current_round();
DROP FUNCTION IF EXISTS public.open_candidate_voting(text);
DROP FUNCTION IF EXISTS public.open_candidate_voting();
DROP FUNCTION IF EXISTS public.open_pnm_voting(text);
DROP FUNCTION IF EXISTS public.open_pnm_voting();
DROP FUNCTION IF EXISTS public.close_candidate_voting();
DROP FUNCTION IF EXISTS public.close_pnm_voting();
DROP FUNCTION IF EXISTS public.start_voting_countdown();
DROP FUNCTION IF EXISTS public.begin_voting_countdown();
DROP FUNCTION IF EXISTS public.finish_voting_countdown(integer, integer);
DROP FUNCTION IF EXISTS public.close_voting();
DROP FUNCTION IF EXISTS public.select_candidate(text);
DROP FUNCTION IF EXISTS public.toggle_app_committee();
DROP FUNCTION IF EXISTS public.setup_section(integer, integer);
DROP FUNCTION IF EXISTS public.setup_voting_section(integer, integer);
DROP FUNCTION IF EXISTS public.switch_round(integer, integer);
DROP FUNCTION IF EXISTS public.initialize_round_data(integer);
DROP FUNCTION IF EXISTS public.initialize_round_data(integer, integer);
DROP FUNCTION IF EXISTS public.evaluate_round_thresholds(integer, integer);
DROP FUNCTION IF EXISTS public.cast_vote(text, uuid, integer, text);
DROP FUNCTION IF EXISTS public.cast_vote(text, uuid, integer, integer, text);
DROP FUNCTION IF EXISTS public.cast_vote(text, text, integer, integer, text);

-- 2. Clean & Recreate "voting-ops" Table
DROP TABLE IF EXISTS public."voting-ops" CASCADE;

CREATE TABLE public."voting-ops" (
    id integer PRIMARY KEY DEFAULT 1,
    section integer NOT NULL DEFAULT 1 CHECK (section IN (1, 2)),
    round integer NOT NULL DEFAULT 1 CHECK (round IN (1, 2, 3)),
    invite_quota integer,
    bid_quota integer,
    round_status text NOT NULL DEFAULT 'idle' CHECK (round_status IN ('idle', 'in_progress', 'completed')),
    voting_status text NOT NULL DEFAULT 'closed' CHECK (voting_status IN ('closed', 'open', 'closing')),
    active_pnm_id text,
    pnm_order text[],
    closing_ends_at timestamptz,
    app_committee_enabled boolean NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public."voting-ops" (id, section, round, round_status, voting_status, app_committee_enabled)
VALUES (1, 1, 1, 'idle', 'closed', false);

-- 3. Configure "voting-thresholds" Table
CREATE TABLE IF NOT EXISTS public."voting-thresholds" (
    id text PRIMARY KEY,
    section integer NOT NULL,
    round integer NOT NULL,
    min_yn_deny numeric NOT NULL DEFAULT 60.0,
    min_yn_approve numeric NOT NULL DEFAULT 85.0,
    max_at_approve numeric NOT NULL DEFAULT 50.0,
    fill_quota_spots boolean NOT NULL DEFAULT false,
    description text,
    updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public."voting-thresholds" (id, section, round, min_yn_deny, min_yn_approve, max_at_approve, fill_quota_spots, description)
VALUES
    ('s1-r1', 1, 1, 60.0, 85.0, 50.0, false, 'Denied: Y/N < 60% | Approved: Y/N > 85% & A/T < 50% | In Contest: 60% <= Y/N <= 85% or (A/T >= 50% & Y/N > 85%)'),
    ('s1-r2', 1, 2, 65.0, -1, -1, true, 'Denied: Y/N < 65% | Approved: Fill remaining invite quota spots with top Y/N% (>= 65%)'),
    ('s2-r1', 2, 1, 60.0, 85.0, 50.0, false, 'Denied: Y/N < 60% | Approved: Y/N > 85% & A/T < 50% | In Contest: 60% <= Y/N <= 85% or (A/T >= 50% & Y/N > 85%)'),
    ('s2-r2', 2, 2, 65.0, 80.0, -1, false, 'Denied: Y/N < 65% | Approved: Y/N > 80% | In Contest: 65% <= Y/N <= 80%'),
    ('s2-r3', 2, 3, 75.0, -1, -1, true, 'Denied: Y/N < 75% | Approved: Fill remaining bid quota spots with top Y/N% (>= 75%)')
ON CONFLICT (id) DO UPDATE SET
    min_yn_deny = EXCLUDED.min_yn_deny,
    min_yn_approve = EXCLUDED.min_yn_approve,
    max_at_approve = EXCLUDED.max_at_approve,
    fill_quota_spots = EXCLUDED.fill_quota_spots,
    description = EXCLUDED.description,
    updated_at = now();

-- 4. Configure "member_votes" Table & Unique Constraint
CREATE TABLE IF NOT EXISTS public.member_votes (
    id bigserial PRIMARY KEY,
    user_id uuid NOT NULL,
    student_id text NOT NULL,
    section_num integer NOT NULL DEFAULT 1,
    round_num integer NOT NULL DEFAULT 1,
    vote_choice text CHECK (vote_choice IN ('yes', 'no', 'abstain')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.member_votes ADD COLUMN IF NOT EXISTS section_num integer NOT NULL DEFAULT 1;
ALTER TABLE public.member_votes ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.member_votes ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.member_votes'::regclass
          AND contype = 'u'
    ) LOOP
        EXECUTE format('ALTER TABLE public.member_votes DROP CONSTRAINT IF EXISTS %I', r.conname);
    END LOOP;
END $$;

DROP INDEX IF EXISTS public.member_votes_student_id_user_id_round_num_idx;
DROP INDEX IF EXISTS public.member_votes_user_id_student_id_round_num_idx;
DROP INDEX IF EXISTS public.member_votes_user_student_sec_rnd_idx;

DELETE FROM public.member_votes a USING public.member_votes b
WHERE a.id < b.id 
  AND a.user_id = b.user_id 
  AND a.student_id = b.student_id 
  AND a.section_num = b.section_num 
  AND a.round_num = b.round_num;

CREATE UNIQUE INDEX member_votes_user_student_sec_rnd_idx 
ON public.member_votes (user_id, student_id, section_num, round_num);

ALTER TABLE public.member_votes 
ADD CONSTRAINT member_votes_user_student_sec_rnd_key 
UNIQUE USING INDEX member_votes_user_student_sec_rnd_idx;

-- 5. Create Section & Round Tally Tables
DO $$
DECLARE
    tbl text;
BEGIN
    FOR tbl IN SELECT unnest(ARRAY['voting-s1-r1', 'voting-s1-r2', 'voting-s2-r1', 'voting-s2-r2', 'voting-s2-r3']) LOOP
        EXECUTE format('
            CREATE TABLE IF NOT EXISTS public.%I (
                id text PRIMARY KEY,
                positive integer NOT NULL DEFAULT 0,
                negative integer NOT NULL DEFAULT 0,
                abstain integer NOT NULL DEFAULT 0,
                status text NOT NULL DEFAULT ''in_contest'',
                updated_at timestamptz NOT NULL DEFAULT now()
            )', tbl);

        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS positive integer NOT NULL DEFAULT 0', tbl);
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS negative integer NOT NULL DEFAULT 0', tbl);
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS abstain integer NOT NULL DEFAULT 0', tbl);
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT ''in_contest''', tbl);
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()', tbl);
    END LOOP;
END $$;

-- 6. Enable Row Level Security & Policies
ALTER TABLE public."voting-ops" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."voting-thresholds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."voting-s1-r1" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."voting-s1-r2" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."voting-s2-r1" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."voting-s2-r2" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."voting-s2-r3" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_votes ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    tbl text;
BEGIN
    FOR tbl IN SELECT unnest(ARRAY['voting-ops', 'voting-thresholds', 'voting-s1-r1', 'voting-s1-r2', 'voting-s2-r1', 'voting-s2-r2', 'voting-s2-r3', 'member_votes']) LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.%I', tbl);
        EXECUTE format('CREATE POLICY "Allow all for authenticated users" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', tbl);
        EXECUTE format('DROP POLICY IF EXISTS "Allow select for public" ON public.%I', tbl);
        EXECUTE format('CREATE POLICY "Allow select for public" ON public.%I FOR SELECT TO public USING (true)', tbl);
    END LOOP;
END $$;

GRANT ALL ON TABLE public."voting-ops" TO authenticated, anon, service_role;
GRANT ALL ON TABLE public."voting-thresholds" TO authenticated, anon, service_role;
GRANT ALL ON TABLE public."voting-s1-r1" TO authenticated, anon, service_role;
GRANT ALL ON TABLE public."voting-s1-r2" TO authenticated, anon, service_role;
GRANT ALL ON TABLE public."voting-s2-r1" TO authenticated, anon, service_role;
GRANT ALL ON TABLE public."voting-s2-r2" TO authenticated, anon, service_role;
GRANT ALL ON TABLE public."voting-s2-r3" TO authenticated, anon, service_role;
GRANT ALL ON TABLE public.member_votes TO authenticated, anon, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon, service_role;

-- 7. Stored Procedure: evaluate_round_thresholds (Accurate Quota Filling and Thresholds)
CREATE OR REPLACE FUNCTION public.evaluate_round_thresholds(p_section integer, p_round integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_table text;
    v_thresh_id text;
    v_deny_yn numeric := 60.0;
    v_approve_yn numeric := 85.0;
    v_approve_at numeric := 50.0;
    v_fill_quota boolean := false;
    v_target integer;
    v_approved_prev integer := 0;
    v_remaining_spots integer := 999;
BEGIN
    v_table := 'voting-s' || p_section || '-r' || p_round;
    v_thresh_id := 's' || p_section || '-r' || p_round;

    IF p_section = 1 AND p_round = 1 THEN
        v_deny_yn := 60.0; v_approve_yn := 85.0; v_approve_at := 50.0; v_fill_quota := false;
    ELSIF p_section = 1 AND p_round = 2 THEN
        v_deny_yn := 65.0; v_approve_yn := -1; v_approve_at := -1; v_fill_quota := true;
    ELSIF p_section = 2 AND p_round = 1 THEN
        v_deny_yn := 60.0; v_approve_yn := 85.0; v_approve_at := 50.0; v_fill_quota := false;
    ELSIF p_section = 2 AND p_round = 2 THEN
        v_deny_yn := 65.0; v_approve_yn := 80.0; v_approve_at := -1; v_fill_quota := false;
    ELSIF p_section = 2 AND p_round = 3 THEN
        v_deny_yn := 75.0; v_approve_yn := -1; v_approve_at := -1; v_fill_quota := true;
    END IF;

    BEGIN
        SELECT min_yn_deny, min_yn_approve, max_at_approve, fill_quota_spots
        INTO v_deny_yn, v_approve_yn, v_approve_at, v_fill_quota
        FROM public."voting-thresholds"
        WHERE id = v_thresh_id;
    EXCEPTION WHEN others THEN
        NULL;
    END;

    IF v_deny_yn IS NULL THEN v_deny_yn := 60.0; END IF;
    IF v_approve_yn IS NULL THEN v_approve_yn := 85.0; END IF;
    IF v_approve_at IS NULL THEN v_approve_at := 50.0; END IF;
    IF v_fill_quota IS NULL THEN v_fill_quota := false; END IF;

    IF v_fill_quota THEN
        -- Calculate remaining quota spots
        IF p_section = 1 THEN
            SELECT invite_quota INTO v_target FROM public."voting-ops" WHERE id = 1;
            SELECT COUNT(*) INTO v_approved_prev FROM public."voting-s1-r1" WHERE status = 'approved';
        ELSIF p_section = 2 THEN
            SELECT bid_quota INTO v_target FROM public."voting-ops" WHERE id = 1;
            SELECT 
                (SELECT COUNT(*) FROM public."voting-s2-r1" WHERE status = 'approved') +
                (SELECT COUNT(*) FROM public."voting-s2-r2" WHERE status = 'approved')
            INTO v_approved_prev;
        END IF;

        IF v_target IS NULL OR v_target <= 0 THEN
            v_remaining_spots := 999;
        ELSE
            v_remaining_spots := GREATEST(0, v_target - COALESCE(v_approved_prev, 0));
        END IF;

        -- Step 1: Default all candidates to denied
        EXECUTE format('
            UPDATE public.%I
            SET status = ''denied'',
                updated_at = now()
            WHERE id IS NOT NULL',
            v_table
        );

        -- Step 2: Rank eligible candidates meeting the minimum Y/N cutoff and approve top spots
        EXECUTE format('
            WITH ranked_candidates AS (
                SELECT id,
                       ROW_NUMBER() OVER (
                           ORDER BY ((COALESCE(positive, 0) * 100.0) / NULLIF(COALESCE(positive, 0) + COALESCE(negative, 0), 0)) DESC,
                                    COALESCE(positive, 0) DESC,
                                    id ASC
                       ) as rank
                FROM public.%I
                WHERE (COALESCE(positive, 0) + COALESCE(negative, 0)) > 0
                  AND (%s < 0 OR ((COALESCE(positive, 0) * 100.0) / NULLIF(COALESCE(positive, 0) + COALESCE(negative, 0), 0)) >= %s)
            )
            UPDATE public.%I t
            SET status = CASE 
                WHEN r.rank <= %s THEN ''approved''
                ELSE ''denied''
            END,
            updated_at = now()
            FROM ranked_candidates r
            WHERE t.id = r.id',
            v_table,
            v_deny_yn,
            v_deny_yn,
            v_table,
            v_remaining_spots
        );

    ELSE
        -- Standard percentage threshold evaluation with safe WHERE clause
        EXECUTE format('
            UPDATE public.%I
            SET status = CASE
                WHEN (COALESCE(positive, 0) + COALESCE(negative, 0) + COALESCE(abstain, 0)) = 0 THEN ''in_contest''
                WHEN (COALESCE(positive, 0) + COALESCE(negative, 0)) = 0 THEN ''in_contest''
                WHEN (%s >= 0 AND ((COALESCE(positive, 0) * 100.0) / NULLIF(COALESCE(positive, 0) + COALESCE(negative, 0), 0)) < %s) THEN ''denied''
                WHEN (%s >= 0 AND ((COALESCE(positive, 0) * 100.0) / NULLIF(COALESCE(positive, 0) + COALESCE(negative, 0), 0)) > %s)
                     AND (%s < 0 OR ((COALESCE(abstain, 0) * 100.0) / NULLIF(COALESCE(positive, 0) + COALESCE(negative, 0) + COALESCE(abstain, 0), 0)) < %s) THEN ''approved''
                ELSE ''in_contest''
            END,
            updated_at = now()
            WHERE id IS NOT NULL',
            v_table,
            v_deny_yn, v_deny_yn,
            v_approve_yn, v_approve_yn,
            v_approve_at, v_approve_at
        );
    END IF;
END;
$$;

-- 8. Stored Procedure: initialize_round_data (Auto-evaluates previous rounds)
CREATE OR REPLACE FUNCTION public.initialize_round_data(p_section integer, p_round integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF p_section = 1 THEN
        IF p_round = 1 THEN
            INSERT INTO public."voting-s1-r1" (id, positive, negative, abstain, status)
            SELECT student_id, 0, 0, 0, 'in_contest'
            FROM public.pnms
            ON CONFLICT (id) DO NOTHING;

        ELSIF p_round = 2 THEN
            -- Auto-evaluate Section 1 Round 1 first so statuses are accurate
            PERFORM public.evaluate_round_thresholds(1, 1);

            INSERT INTO public."voting-s1-r2" (id, positive, negative, abstain, status)
            SELECT id, 0, 0, 0, 'in_contest'
            FROM public."voting-s1-r1"
            WHERE status = 'in_contest'
            ON CONFLICT (id) DO NOTHING;
        END IF;

    ELSIF p_section = 2 THEN
        IF p_round = 1 THEN
            -- Section 2 Round 1: strictly approved candidates from Section 1 (R1 or R2)
            PERFORM public.evaluate_round_thresholds(1, 1);
            PERFORM public.evaluate_round_thresholds(1, 2);

            INSERT INTO public."voting-s2-r1" (id, positive, negative, abstain, status)
            SELECT id, 0, 0, 0, 'in_contest'
            FROM (
                SELECT id FROM public."voting-s1-r1" WHERE status = 'approved'
                UNION
                SELECT id FROM public."voting-s1-r2" WHERE status = 'approved'
            ) approved_invites
            ON CONFLICT (id) DO NOTHING;

        ELSIF p_round = 2 THEN
            PERFORM public.evaluate_round_thresholds(2, 1);

            INSERT INTO public."voting-s2-r2" (id, positive, negative, abstain, status)
            SELECT id, 0, 0, 0, 'in_contest'
            FROM public."voting-s2-r1"
            WHERE status = 'in_contest'
            ON CONFLICT (id) DO NOTHING;

        ELSIF p_round = 3 THEN
            PERFORM public.evaluate_round_thresholds(2, 2);

            INSERT INTO public."voting-s2-r3" (id, positive, negative, abstain, status)
            SELECT id, 0, 0, 0, 'in_contest'
            FROM public."voting-s2-r2"
            WHERE status = 'in_contest'
            ON CONFLICT (id) DO NOTHING;
        END IF;
    END IF;
END;
$$;

-- 9. Stored Procedure: setup_section
CREATE OR REPLACE FUNCTION public.setup_section(p_section integer, p_quota integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF p_section = 1 THEN
        DELETE FROM public.member_votes WHERE section_num = 1;
        TRUNCATE TABLE public."voting-s1-r1";
        TRUNCATE TABLE public."voting-s1-r2";

        PERFORM public.initialize_round_data(1, 1);

        UPDATE public."voting-ops"
        SET section = 1,
            round = 1,
            invite_quota = p_quota,
            round_status = 'idle',
            voting_status = 'closed',
            active_pnm_id = NULL,
            pnm_order = NULL,
            closing_ends_at = NULL,
            updated_at = now()
        WHERE id = 1;

    ELSIF p_section = 2 THEN
        DELETE FROM public.member_votes WHERE section_num = 2;
        TRUNCATE TABLE public."voting-s2-r1";
        TRUNCATE TABLE public."voting-s2-r2";
        TRUNCATE TABLE public."voting-s2-r3";

        PERFORM public.initialize_round_data(2, 1);

        UPDATE public."voting-ops"
        SET section = 2,
            round = 1,
            bid_quota = p_quota,
            round_status = 'idle',
            voting_status = 'closed',
            active_pnm_id = NULL,
            pnm_order = NULL,
            closing_ends_at = NULL,
            updated_at = now()
        WHERE id = 1;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.setup_voting_section(p_section integer, p_target_count integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    PERFORM public.setup_section(p_section, p_target_count);
END;
$$;

-- 10. Stored Procedure: switch_round
CREATE OR REPLACE FUNCTION public.switch_round(p_section integer, p_round integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    PERFORM public.initialize_round_data(p_section, p_round);

    UPDATE public."voting-ops"
    SET section = p_section,
        round = p_round,
        round_status = 'idle',
        voting_status = 'closed',
        active_pnm_id = NULL,
        pnm_order = NULL,
        closing_ends_at = NULL,
        updated_at = now()
    WHERE id = 1;
END;
$$;

-- 11. Stored Procedure: start_round
CREATE OR REPLACE FUNCTION public.start_round(p_section integer, p_round integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_pnm_order text[];
    v_first_pnm text;
    v_table text;
BEGIN
    PERFORM public.initialize_round_data(p_section, p_round);

    v_table := 'voting-s' || p_section || '-r' || p_round;

    EXECUTE format('
        SELECT array_agg(id ORDER BY random())
        FROM public.%I
        WHERE status = ''in_contest''',
        v_table
    ) INTO v_pnm_order;

    IF v_pnm_order IS NOT NULL AND array_length(v_pnm_order, 1) > 0 THEN
        v_first_pnm := v_pnm_order[1];
    ELSE
        v_first_pnm := NULL;
    END IF;

    UPDATE public."voting-ops"
    SET section = p_section,
        round = p_round,
        round_status = 'in_progress',
        voting_status = 'open',
        pnm_order = v_pnm_order,
        active_pnm_id = v_first_pnm,
        closing_ends_at = NULL,
        updated_at = now()
    WHERE id = 1;
END;
$$;

-- 12. Stored Procedures: Round-Level Countdown & Close Controls
CREATE OR REPLACE FUNCTION public.begin_voting_countdown()
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_deadline timestamptz;
BEGIN
    UPDATE public."voting-ops"
    SET voting_status = 'closing',
        closing_ends_at = clock_timestamp() + interval '5 seconds',
        updated_at = clock_timestamp()
    WHERE id = 1
      AND round_status = 'in_progress'
      AND voting_status = 'open'
    RETURNING closing_ends_at INTO v_deadline;

    RETURN v_deadline;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_voting_countdown()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.begin_voting_countdown();
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_voting_countdown(p_section integer, p_round integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sec integer;
    v_rnd integer;
    v_round_status text;
    v_voting_status text;
    v_closing_ends_at timestamptz;
BEGIN
    SELECT section, round, round_status, voting_status, closing_ends_at
    INTO v_sec, v_rnd, v_round_status, v_voting_status, v_closing_ends_at
    FROM public."voting-ops"
    WHERE id = 1
    FOR UPDATE;

    IF NOT FOUND
       OR v_sec <> p_section
       OR v_rnd <> p_round
       OR v_round_status <> 'in_progress'
       OR v_voting_status <> 'closing'
       OR v_closing_ends_at IS NULL
       OR v_closing_ends_at > clock_timestamp() THEN
        RETURN false;
    END IF;

    BEGIN
        PERFORM public.evaluate_round_thresholds(v_sec, v_rnd);
    EXCEPTION WHEN others THEN
        RAISE WARNING 'evaluate_round_thresholds error: %', SQLERRM;
    END;

    UPDATE public."voting-ops"
    SET round_status = 'completed',
        voting_status = 'closed',
        closing_ends_at = NULL,
        updated_at = clock_timestamp()
    WHERE id = 1;

    RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_voting()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sec integer;
    v_rnd integer;
BEGIN
    SELECT section, round INTO v_sec, v_rnd FROM public."voting-ops" WHERE id = 1;
    PERFORM public.finish_voting_countdown(v_sec, v_rnd);
END;
$$;

CREATE OR REPLACE FUNCTION public.end_round(p_section integer, p_round integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.finish_voting_countdown(p_section, p_round);
END;
$$;

-- 13. Candidate Selection & App Committee
CREATE OR REPLACE FUNCTION public.select_candidate(p_student_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public."voting-ops"
    SET active_pnm_id = p_student_id,
        closing_ends_at = NULL,
        updated_at = now()
    WHERE id = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.toggle_app_committee()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public."voting-ops"
    SET app_committee_enabled = NOT app_committee_enabled,
        updated_at = now()
    WHERE id = 1;
END;
$$;

-- 14. Stored Procedure: cast_vote
CREATE OR REPLACE FUNCTION public.cast_vote(
    p_student_id text,
    p_user_id uuid,
    p_section_num integer,
    p_round_num integer,
    p_vote_choice text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_table text;
    v_pos integer;
    v_neg integer;
    v_abs integer;
BEGIN
    IF p_vote_choice IS NULL THEN
        DELETE FROM public.member_votes
        WHERE user_id = p_user_id
          AND student_id = p_student_id
          AND section_num = p_section_num
          AND round_num = p_round_num;
    ELSE
        INSERT INTO public.member_votes (user_id, student_id, section_num, round_num, vote_choice, updated_at)
        VALUES (p_user_id, p_student_id, p_section_num, p_round_num, p_vote_choice, now())
        ON CONFLICT (user_id, student_id, section_num, round_num)
        DO UPDATE SET vote_choice = EXCLUDED.vote_choice, updated_at = now();
    END IF;

    SELECT 
        COUNT(*) FILTER (WHERE vote_choice = 'yes'),
        COUNT(*) FILTER (WHERE vote_choice = 'no'),
        COUNT(*) FILTER (WHERE vote_choice = 'abstain')
    INTO v_pos, v_neg, v_abs
    FROM public.member_votes
    WHERE student_id = p_student_id
      AND section_num = p_section_num
      AND round_num = p_round_num;

    v_table := 'voting-s' || p_section_num || '-r' || p_round_num;

    EXECUTE format('
        INSERT INTO public.%I (id, positive, negative, abstain, updated_at)
        VALUES (%L, %s, %s, %s, now())
        ON CONFLICT (id)
        DO UPDATE SET positive = EXCLUDED.positive,
                      negative = EXCLUDED.negative,
                      abstain = EXCLUDED.abstain,
                      updated_at = now()',
        v_table, p_student_id, v_pos, v_neg, v_abs
    );
END;
$$;

-- Grant execution privileges on all stored procedures
GRANT EXECUTE ON FUNCTION public.initialize_round_data(integer, integer) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.setup_section(integer, integer) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.setup_voting_section(integer, integer) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.switch_round(integer, integer) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.start_round(integer, integer) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.end_round(integer, integer) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.start_voting_countdown() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.begin_voting_countdown() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.finish_voting_countdown(integer, integer) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.close_voting() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.select_candidate(text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.toggle_app_committee() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.evaluate_round_thresholds(integer, integer) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.cast_vote(text, uuid, integer, integer, text) TO authenticated, anon, service_role;

-- 15. Realtime Publication Configuration
DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public."voting-ops";
    EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL;
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public."voting-thresholds";
    EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL;
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public."voting-s1-r1";
    EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL;
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public."voting-s1-r2";
    EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL;
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public."voting-s2-r1";
    EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL;
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public."voting-s2-r2";
    EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL;
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public."voting-s2-r3";
    EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL;
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.member_votes;
    EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL;
    END;
END $$;

-- ==============================================================================
-- 16. PNM Review Splits (Split Search for Rush Committee)
-- ==============================================================================

-- Add review_code column to pnms table
ALTER TABLE public.pnms ADD COLUMN IF NOT EXISTS review_code text;

-- Create review splits tracking table
CREATE TABLE IF NOT EXISTS public.pnm_review_splits (
    id bigserial PRIMARY KEY,
    code text NOT NULL,
    student_id text NOT NULL,
    reviewer_index integer NOT NULL,
    total_reviewers integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pnm_review_splits_code ON public.pnm_review_splits(code);
ALTER TABLE public.pnm_review_splits ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.pnm_review_splits;
    CREATE POLICY "Allow all for authenticated users" ON public.pnm_review_splits FOR ALL TO authenticated USING (true) WITH CHECK (true);
    DROP POLICY IF EXISTS "Allow select for public" ON public.pnm_review_splits;
    CREATE POLICY "Allow select for public" ON public.pnm_review_splits FOR SELECT TO public USING (true);
END $$;

GRANT ALL ON TABLE public.pnm_review_splits TO authenticated, anon, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon, service_role;

-- Stored Procedure: split_pnm_reviews
CREATE OR REPLACE FUNCTION public.split_pnm_reviews(p_num_reviewers integer)
RETURNS TABLE (
    reviewer_index integer,
    code text,
    pnm_count integer,
    student_ids text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total integer;
    v_base integer;
    v_rem integer;
    v_shuffled_ids text[];
    v_idx integer := 1;
    v_start integer := 1;
    v_len integer;
    v_code text;
    v_slice text[];
BEGIN
    IF p_num_reviewers <= 0 THEN
        RAISE EXCEPTION 'Number of reviewers must be greater than 0';
    END IF;

    -- Fetch all PNM IDs in random order
    SELECT array_agg(student_id ORDER BY random())
    INTO v_shuffled_ids
    FROM public.pnms;

    v_total := COALESCE(array_length(v_shuffled_ids, 1), 0);
    IF v_total = 0 THEN
        RETURN;
    END IF;

    v_base := v_total / p_num_reviewers;
    v_rem := v_total % p_num_reviewers;

    -- Clear old review codes from pnms and table
    UPDATE public.pnms SET review_code = NULL;
    DELETE FROM public.pnm_review_splits;

    FOR v_idx IN 1..p_num_reviewers LOOP
        v_len := v_base + (CASE WHEN v_idx <= v_rem THEN 1 ELSE 0 END);
        IF v_len <= 0 THEN
            CONTINUE;
        END IF;

        -- Generate 6-char random hex code
        v_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 6));
        v_slice := v_shuffled_ids[v_start : (v_start + v_len - 1)];
        v_start := v_start + v_len;

        -- Update pnms
        UPDATE public.pnms
        SET review_code = v_code
        WHERE student_id = ANY(v_slice);

        -- Insert into pnm_review_splits
        INSERT INTO public.pnm_review_splits (code, student_id, reviewer_index, total_reviewers)
        SELECT v_code, unnest(v_slice), v_idx, p_num_reviewers;

        reviewer_index := v_idx;
        code := v_code;
        pnm_count := v_len;
        student_ids := v_slice;
        RETURN NEXT;
    END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.split_pnm_reviews(integer) TO authenticated, anon, service_role;

DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.pnm_review_splits;
    EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL;
    END;
END $$;
