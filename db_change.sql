-- ==========================================
-- 1. Migrate pnm_feedback table columns
-- ==========================================
-- Delete the old "is_read" column
alter table public.pnm_feedback drop column if exists is_read;

-- Add the new "is_approved" column as integer
-- 0 = not approved (neutral/pending)
-- 1 = approved
-- -1 = declined
alter table public.pnm_feedback add column if not exists is_approved integer not null default 0 check (is_approved in (-1, 0, 1));

-- Add the new "quick" column as boolean
alter table public.pnm_feedback add column if not exists quick boolean not null default false;


-- ==========================================
-- 2. Recreate go_live function (Random Ordering)
-- ==========================================
create or replace function public.go_live(p_round integer)
returns void
language plpgsql
security definer
as $$
declare
  v_pnm_order text[];
begin
  -- 1. Initialize round rows if not exists
  perform public.initialize_round_data(p_round);

  -- 2. Determine ordering: completely random for all rounds!
  select array_agg(student_id order by random()) into v_pnm_order
  from public.pnms;

  -- 3. Update voting-ops
  update public."voting-ops"
  set voting_round = p_round,
      is_live = true,
      pnm_order = v_pnm_order,
      updated_at = now()
  where id = 1;
end;
$$;
-- ==========================================
-- 3. Public Policies (For Quick Feedback)
-- ==========================================
-- Ensure public (unauthenticated/anon) select on the pnms table is allowed 
-- so that non-logged-in users can search for candidate names
drop policy if exists "Allow public select pnms" on public.pnms;
create policy "Allow public select pnms" on public.pnms for select to public using (true);

-- Ensure public (unauthenticated/anon) insert into the pnm_feedback table 
-- is allowed so that non-logged-in users can submit quick feedback
drop policy if exists "Allow public insert pnm_feedback" on public.pnm_feedback;
create policy "Allow public insert pnm_feedback" on public.pnm_feedback for insert to public with check (true);
