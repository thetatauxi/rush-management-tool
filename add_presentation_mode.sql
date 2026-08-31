-- ==============================================================================
-- Migration: Add Presentation Mode Columns to "voting-ops" (Rounds 2 & 4)
-- ==============================================================================

-- 1. Add active_pnm_id and closing_ends_at to the voting-ops table
ALTER TABLE public."voting-ops"
ADD COLUMN IF NOT EXISTS active_pnm_id text,
ADD COLUMN IF NOT EXISTS closing_ends_at timestamptz;

-- 2. Update go_live stored procedure to initialize active_pnm_id
CREATE OR REPLACE FUNCTION public.go_live(p_round integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pnm_order text[];
  v_first_pnm text;
BEGIN
  -- 1. Initialize round rows if not exists
  PERFORM public.initialize_round_data(p_round);

  -- 2. Determine ordering: completely random for all rounds
  SELECT array_agg(student_id ORDER BY random()) INTO v_pnm_order
  FROM public.pnms;

  -- 3. Get the first PNM in the randomized order for presentation mode
  IF v_pnm_order IS NOT NULL AND array_length(v_pnm_order, 1) > 0 THEN
    v_first_pnm := v_pnm_order[1];
  ELSE
    v_first_pnm := NULL;
  END IF;

  -- 4. Update voting-ops with round, live status, randomized order, and initial active PNM
  UPDATE public."voting-ops"
  SET voting_round = p_round,
      is_live = true,
      pnm_order = v_pnm_order,
      active_pnm_id = v_first_pnm,
      closing_ends_at = NULL,
      updated_at = now()
  WHERE id = 1;
END;
$$;

-- 3. Ensure Realtime Publication includes all voting tables and member_votes
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE "voting-ops", "voting-r1", "voting-r2", "voting-r3", "voting-r4", "member_votes";
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN others THEN NULL;
  END;
END $$;
