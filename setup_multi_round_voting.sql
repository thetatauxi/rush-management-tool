-- ==============================================================================
-- Migration: Complete Reorganization of Multi-Round Voting System
-- ==============================================================================

-- 1. Drop old functions to avoid signature conflicts and overloads
DROP FUNCTION IF EXISTS public.go_live(integer);
DROP FUNCTION IF EXISTS public.go_live(integer, integer);
DROP FUNCTION IF EXISTS public.start_round(integer, integer);
DROP FUNCTION IF EXISTS public.end_round(integer, integer);
DROP FUNCTION IF EXISTS public.open_candidate_voting(text);
DROP FUNCTION IF EXISTS public.open_candidate_voting();
DROP FUNCTION IF EXISTS public.open_pnm_voting(text);
DROP FUNCTION IF EXISTS public.open_pnm_voting();
DROP FUNCTION IF EXISTS public.close_candidate_voting();
DROP FUNCTION IF EXISTS public.close_pnm_voting();
DROP FUNCTION IF EXISTS public.start_voting_countdown();
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

-- 3. Configure "member_votes" Table & Unique Constraint
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

-- Ensure section_num, created_at, and updated_at exist
ALTER TABLE public.member_votes ADD COLUMN IF NOT EXISTS section_num integer NOT NULL DEFAULT 1;
ALTER TABLE public.member_votes ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.member_votes ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Drop all old unique constraints & indexes on member_votes
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

-- Remove duplicate records
DELETE FROM public.member_votes a USING public.member_votes b
WHERE a.id < b.id 
  AND a.user_id = b.user_id 
  AND a.student_id = b.student_id 
  AND a.section_num = b.section_num 
  AND a.round_num = b.round_num;

-- Create composite 4-column unique constraint
CREATE UNIQUE INDEX member_votes_user_student_sec_rnd_idx 
ON public.member_votes (user_id, student_id, section_num, round_num);

ALTER TABLE public.member_votes 
ADD CONSTRAINT member_votes_user_student_sec_rnd_key 
UNIQUE USING INDEX member_votes_user_student_sec_rnd_idx;

-- 4. Create Section & Round Tally Tables
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

-- 5. Enable Row Level Security & Policies
ALTER TABLE public."voting-ops" ENABLE ROW LEVEL SECURITY;
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
    FOR tbl IN SELECT unnest(ARRAY['voting-ops', 'voting-s1-r1', 'voting-s1-r2', 'voting-s2-r1', 'voting-s2-r2', 'voting-s2-r3', 'member_votes']) LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Allow all for authenticated users" ON public.%I', tbl);
        EXECUTE format('CREATE POLICY "Allow all for authenticated users" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', tbl);
        EXECUTE format('DROP POLICY IF EXISTS "Allow select for public" ON public.%I', tbl);
        EXECUTE format('CREATE POLICY "Allow select for public" ON public.%I FOR SELECT TO public USING (true)', tbl);
    END LOOP;
END $$;

-- Explicit table and sequence grants
GRANT ALL ON TABLE public."voting-ops" TO authenticated, anon, service_role;
GRANT ALL ON TABLE public."voting-s1-r1" TO authenticated, anon, service_role;
GRANT ALL ON TABLE public."voting-s1-r2" TO authenticated, anon, service_role;
GRANT ALL ON TABLE public."voting-s2-r1" TO authenticated, anon, service_role;
GRANT ALL ON TABLE public."voting-s2-r2" TO authenticated, anon, service_role;
GRANT ALL ON TABLE public."voting-s2-r3" TO authenticated, anon, service_role;
GRANT ALL ON TABLE public.member_votes TO authenticated, anon, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon, service_role;

-- 6. Stored Procedure: initialize_round_data
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
            INSERT INTO public."voting-s1-r2" (id, positive, negative, abstain, status)
            SELECT id, 0, 0, 0, 'in_contest'
            FROM public."voting-s1-r1"
            WHERE status = 'in_contest'
            ON CONFLICT (id) DO NOTHING;
        END IF;

    ELSIF p_section = 2 THEN
        IF p_round = 1 THEN
            -- Section 2 Round 1: strictly approved candidates from Section 1 (R1 or R2)
            INSERT INTO public."voting-s2-r1" (id, positive, negative, abstain, status)
            SELECT id, 0, 0, 0, 'in_contest'
            FROM (
                SELECT id FROM public."voting-s1-r1" WHERE status = 'approved'
                UNION
                SELECT id FROM public."voting-s1-r2" WHERE status = 'approved'
            ) approved_invites
            ON CONFLICT (id) DO NOTHING;

        ELSIF p_round = 2 THEN
            INSERT INTO public."voting-s2-r2" (id, positive, negative, abstain, status)
            SELECT id, 0, 0, 0, 'in_contest'
            FROM public."voting-s2-r1"
            WHERE status = 'in_contest'
            ON CONFLICT (id) DO NOTHING;

        ELSIF p_round = 3 THEN
            INSERT INTO public."voting-s2-r3" (id, positive, negative, abstain, status)
            SELECT id, 0, 0, 0, 'in_contest'
            FROM public."voting-s2-r2"
            WHERE status = 'in_contest'
            ON CONFLICT (id) DO NOTHING;
        END IF;
    END IF;
END;
$$;

-- 7. Stored Procedure: setup_section
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

-- Alias setup_voting_section for backward compatibility
CREATE OR REPLACE FUNCTION public.setup_voting_section(p_section integer, p_target_count integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    PERFORM public.setup_section(p_section, p_target_count);
END;
$$;

-- 8. Stored Procedure: switch_round
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

-- 9. Stored Procedure: start_round
CREATE OR REPLACE FUNCTION public.start_round(p_section integer, p_round integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_pnm_order text[];
    v_first_pnm text;
    v_table text;
    v_is_grid boolean;
BEGIN
    PERFORM public.initialize_round_data(p_section, p_round);

    v_table := 'voting-s' || p_section || '-r' || p_round;
    v_is_grid := (p_section = 1 AND p_round = 1);

    -- Determine random order once for in-contest candidates
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

    IF v_is_grid THEN
        -- Section 1 Round 1 Grid Mode: voting is immediately open for all PNMs
        UPDATE public."voting-ops"
        SET section = p_section,
            round = p_round,
            round_status = 'in_progress',
            voting_status = 'open',
            pnm_order = v_pnm_order,
            active_pnm_id = NULL,
            closing_ends_at = NULL,
            updated_at = now()
        WHERE id = 1;
    ELSE
        -- Presentation Mode: round is active, candidate selected, voting closed until opened
        UPDATE public."voting-ops"
        SET section = p_section,
            round = p_round,
            round_status = 'in_progress',
            voting_status = 'closed',
            pnm_order = v_pnm_order,
            active_pnm_id = v_first_pnm,
            closing_ends_at = NULL,
            updated_at = now()
        WHERE id = 1;
    END IF;
END;
$$;

-- 10. Stored Procedures: Candidate-Level Voting Controls
CREATE OR REPLACE FUNCTION public.open_candidate_voting(p_student_id text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public."voting-ops"
    SET voting_status = 'open',
        closing_ends_at = NULL,
        active_pnm_id = COALESCE(p_student_id, active_pnm_id),
        updated_at = now()
    WHERE id = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.open_pnm_voting(p_student_id text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    PERFORM public.open_candidate_voting(p_student_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.start_voting_countdown()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public."voting-ops"
    SET voting_status = 'closing',
        closing_ends_at = now() + interval '5 seconds',
        updated_at = now()
    WHERE id = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_voting()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_sec integer;
    v_rnd integer;
BEGIN
    SELECT section, round INTO v_sec, v_rnd FROM public."voting-ops" WHERE id = 1;

    IF v_sec = 1 AND v_rnd = 1 THEN
        -- Closing Section 1 Round 1 also evaluates thresholds
        BEGIN
            PERFORM public.evaluate_round_thresholds(1, 1);
        EXCEPTION WHEN others THEN
            RAISE WARNING 'evaluate_round_thresholds error: %', SQLERRM;
        END;

        UPDATE public."voting-ops"
        SET round_status = 'completed',
            voting_status = 'closed',
            closing_ends_at = NULL,
            updated_at = now()
        WHERE id = 1;
    ELSE
        -- In presentation mode, only close voting for that candidate (round stays in_progress)
        UPDATE public."voting-ops"
        SET voting_status = 'closed',
            closing_ends_at = NULL,
            updated_at = now()
        WHERE id = 1;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.close_pnm_voting()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    PERFORM public.close_voting();
END;
$$;

-- 11. Stored Procedure: end_round
CREATE OR REPLACE FUNCTION public.end_round(p_section integer, p_round integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    BEGIN
        PERFORM public.evaluate_round_thresholds(p_section, p_round);
    EXCEPTION WHEN others THEN
        RAISE WARNING 'evaluate_round_thresholds error: %', SQLERRM;
    END;

    UPDATE public."voting-ops"
    SET round_status = 'completed',
        voting_status = 'closed',
        closing_ends_at = NULL,
        updated_at = now()
    WHERE id = 1;
END;
$$;

-- 12. Candidate Selection & App Committee
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

-- 13. Stored Procedure: evaluate_round_thresholds
CREATE OR REPLACE FUNCTION public.evaluate_round_thresholds(p_section integer, p_round integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_table text;
    v_target integer;
    v_approved_prev integer;
    v_remaining_spots integer;
BEGIN
    v_table := 'voting-s' || p_section || '-r' || p_round;

    IF p_section = 1 THEN
        -- Section 1: Invite Voting
        IF p_round = 1 THEN
            EXECUTE format('
                UPDATE public.%I
                SET status = CASE
                    WHEN (positive + negative + abstain) = 0 THEN ''in_contest''
                    WHEN (positive + negative) = 0 THEN ''in_contest''
                    WHEN ((positive * 100.0) / (positive + negative)) < 60.0 THEN ''denied''
                    WHEN ((positive * 100.0) / (positive + negative)) > 85.0 
                         AND ((abstain * 100.0) / (positive + negative + abstain)) < 50.0 THEN ''approved''
                    ELSE ''in_contest''
                END,
                updated_at = now()',
                v_table
            );

        ELSIF p_round = 2 THEN
            SELECT invite_quota INTO v_target FROM public."voting-ops" WHERE id = 1;
            SELECT COUNT(*) INTO v_approved_prev FROM public."voting-s1-r1" WHERE status = 'approved';
            v_remaining_spots := GREATEST(0, COALESCE(v_target, 999) - v_approved_prev);

            -- 1. Mark < 65% as denied
            EXECUTE format('
                UPDATE public.%I
                SET status = ''denied'',
                    updated_at = now()
                WHERE (positive + negative) = 0 
                   OR ((positive * 100.0) / (positive + negative)) < 65.0',
                v_table
            );

            -- 2. Fill top remaining spots for candidates with Y/N >= 65%
            EXECUTE format('
                WITH ranked_pnms AS (
                    SELECT id,
                           ROW_NUMBER() OVER (
                               ORDER BY ((positive * 100.0) / NULLIF(positive + negative, 0)) DESC,
                                        positive DESC,
                                        id ASC
                           ) as rank
                    FROM public.%I
                    WHERE (positive + negative) > 0 
                      AND ((positive * 100.0) / (positive + negative)) >= 65.0
                )
                UPDATE public.%I t
                SET status = CASE 
                    WHEN r.rank <= %s THEN ''approved''
                    ELSE ''denied''
                END,
                updated_at = now()
                FROM ranked_pnms r
                WHERE t.id = r.id',
                v_table, v_table, v_remaining_spots
            );
        END IF;

    ELSIF p_section = 2 THEN
        -- Section 2: Bid Voting
        IF p_round = 1 THEN
            EXECUTE format('
                UPDATE public.%I
                SET status = CASE
                    WHEN (positive + negative + abstain) = 0 THEN ''in_contest''
                    WHEN (positive + negative) = 0 THEN ''in_contest''
                    WHEN ((positive * 100.0) / (positive + negative)) < 60.0 THEN ''denied''
                    WHEN ((positive * 100.0) / (positive + negative)) > 85.0 
                         AND ((abstain * 100.0) / (positive + negative + abstain)) < 50.0 THEN ''approved''
                    ELSE ''in_contest''
                END,
                updated_at = now()',
                v_table
            );

        ELSIF p_round = 2 THEN
            EXECUTE format('
                UPDATE public.%I
                SET status = CASE
                    WHEN (positive + negative) = 0 THEN ''in_contest''
                    WHEN ((positive * 100.0) / (positive + negative)) < 65.0 THEN ''denied''
                    WHEN ((positive * 100.0) / (positive + negative)) > 80.0 THEN ''approved''
                    ELSE ''in_contest''
                END,
                updated_at = now()',
                v_table
            );

        ELSIF p_round = 3 THEN
            SELECT bid_quota INTO v_target FROM public."voting-ops" WHERE id = 1;
            SELECT 
                (SELECT COUNT(*) FROM public."voting-s2-r1" WHERE status = 'approved') +
                (SELECT COUNT(*) FROM public."voting-s2-r2" WHERE status = 'approved')
            INTO v_approved_prev;

            v_remaining_spots := GREATEST(0, COALESCE(v_target, 999) - v_approved_prev);

            -- 1. Mark < 75% as denied
            EXECUTE format('
                UPDATE public.%I
                SET status = ''denied'',
                    updated_at = now()
                WHERE (positive + negative) = 0 
                   OR ((positive * 100.0) / (positive + negative)) < 75.0',
                v_table
            );

            -- 2. Fill top remaining spots for candidates with Y/N >= 75%
            EXECUTE format('
                WITH ranked_pnms AS (
                    SELECT id,
                           ROW_NUMBER() OVER (
                               ORDER BY ((positive * 100.0) / NULLIF(positive + negative, 0)) DESC,
                                        positive DESC,
                                        id ASC
                           ) as rank
                    FROM public.%I
                    WHERE (positive + negative) > 0 
                      AND ((positive * 100.0) / (positive + negative)) >= 75.0
                )
                UPDATE public.%I t
                SET status = CASE 
                    WHEN r.rank <= %s THEN ''approved''
                    ELSE ''denied''
                END,
                updated_at = now()
                FROM ranked_pnms r
                WHERE t.id = r.id',
                v_table, v_table, v_remaining_spots
            );
        END IF;
    END IF;
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
    -- 1. Upsert or delete member vote
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

    -- 2. Calculate new tallies for this candidate in the round
    SELECT 
        COUNT(*) FILTER (WHERE vote_choice = 'yes'),
        COUNT(*) FILTER (WHERE vote_choice = 'no'),
        COUNT(*) FILTER (WHERE vote_choice = 'abstain')
    INTO v_pos, v_neg, v_abs
    FROM public.member_votes
    WHERE student_id = p_student_id
      AND section_num = p_section_num
      AND round_num = p_round_num;

    -- 3. Upsert round tally table
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
GRANT EXECUTE ON FUNCTION public.open_candidate_voting(text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.open_pnm_voting(text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.start_voting_countdown() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.close_voting() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.close_pnm_voting() TO authenticated, anon, service_role;
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
