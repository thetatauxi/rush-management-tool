-- Non-destructive migration: make the voting countdown server-authoritative.
-- Safe to run against the existing database.

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
    SELECT section, round INTO v_sec, v_rnd
    FROM public."voting-ops"
    WHERE id = 1;

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

GRANT EXECUTE ON FUNCTION public.start_voting_countdown() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.begin_voting_countdown() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.finish_voting_countdown(integer, integer) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.close_voting() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.end_round(integer, integer) TO authenticated, anon, service_role;
