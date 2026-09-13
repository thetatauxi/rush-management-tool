-- ==========================================================
-- Allow members and public to delete their feedback rows
-- ==========================================================

-- Ensure public (including authenticated users) can delete from pnm_feedback
drop policy if exists "Allow delete pnm_feedback" on public.pnm_feedback;
create policy "Allow delete pnm_feedback" on public.pnm_feedback for delete to public using (true);

-- Ensure select policy allows selecting pending feedback
drop policy if exists "Allow select pnm_feedback" on public.pnm_feedback;
create policy "Allow select pnm_feedback" on public.pnm_feedback for select to public using (true);
