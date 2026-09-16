-- ==============================================================================
-- Migration: Add PNM Application Status Field & Voting Exclusion
-- System: Rush Management Tool (RMT)
-- Description:
--   1. Adds 'application' boolean column to public.pnms (TRUE/FALSE).
--      Default is TRUE so existing records remain valid until marked false.
--   2. Updates round initialization, candidate ordering, and voting routines
--      to strictly exclude any PNM whose application is FALSE.
--   3. Adds an automatic trigger to purge candidates from voting tables
--      if their application is updated to FALSE.
-- ==============================================================================

BEGIN;

-- 1. Add application column to public.pnms
ALTER TABLE public.pnms 
ADD COLUMN IF NOT EXISTS application boolean NOT NULL DEFAULT true;

-- Ensure an index exists for fast filtering
CREATE INDEX IF NOT EXISTS idx_pnms_application ON public.pnms(application);

-- 2. Update initialize_round_data to only include candidates with application = TRUE in Section 1 Round 1
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
            WHERE application IS TRUE
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

-- 3. Update start_round to strictly exclude candidates with application = FALSE from pnm_order
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
        SELECT array_agg(t.id ORDER BY random())
        FROM public.%I t
        JOIN public.pnms p ON p.student_id = t.id
        WHERE t.status = ''in_contest''
          AND p.application IS TRUE',
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

-- 4. Update cast_vote to disallow casting votes on candidates without an application
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
    v_app boolean;
BEGIN
    -- Verify candidate has submitted an application
    SELECT application INTO v_app FROM public.pnms WHERE student_id = p_student_id;
    IF v_app IS NOT TRUE THEN
        RAISE EXCEPTION 'Candidate % has not submitted an application and is not eligible for voting.', p_student_id;
    END IF;

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

-- 5. Trigger to automatically remove candidates from voting tables if application is set to FALSE
CREATE OR REPLACE FUNCTION public.handle_pnm_application_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NEW.application IS FALSE THEN
        -- Remove candidate from all voting round tables
        DELETE FROM public."voting-s1-r1" WHERE id = NEW.student_id;
        DELETE FROM public."voting-s1-r2" WHERE id = NEW.student_id;
        DELETE FROM public."voting-s2-r1" WHERE id = NEW.student_id;
        DELETE FROM public."voting-s2-r2" WHERE id = NEW.student_id;
        DELETE FROM public."voting-s2-r3" WHERE id = NEW.student_id;
        DELETE FROM public.member_votes WHERE student_id = NEW.student_id;

        -- Update voting-ops if candidate is active or in the current order
        UPDATE public."voting-ops"
        SET active_pnm_id = CASE WHEN active_pnm_id = NEW.student_id THEN NULL ELSE active_pnm_id END,
            pnm_order = array_remove(pnm_order, NEW.student_id),
            updated_at = now()
        WHERE id = 1;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pnm_application_update ON public.pnms;
CREATE TRIGGER trg_pnm_application_update
AFTER UPDATE OF application ON public.pnms
FOR EACH ROW
EXECUTE FUNCTION public.handle_pnm_application_update();

-- Grant privileges
GRANT EXECUTE ON FUNCTION public.initialize_round_data(integer, integer) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.start_round(integer, integer) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.cast_vote(text, uuid, integer, integer, text) TO authenticated, anon, service_role;

COMMIT;
