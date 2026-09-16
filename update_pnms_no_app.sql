-- ==============================================================================
-- Bulk Update: Set Application = FALSE for a List of PNMs (From Excel)
-- System: Rush Management Tool (RMT)
--
-- Instructions:
--   1. Open your Excel spreadsheet and highlight/copy the column of Student IDs (Ctrl+C).
--   2. In the Supabase SQL Editor, paste the IDs directly between the $IDS$ tags below.
--      You do NOT need to add single quotes or commas around each ID!
--      PostgreSQL will automatically split each row/line.
--   3. Click "Run".
-- ==============================================================================

UPDATE public.pnms
SET application = false
WHERE student_id IN (
    SELECT trim(id_token)
    FROM regexp_split_to_table(
$IDS$
-- >>> PASTE EXCEL COLUMN HERE <<<
9081234567
9087654321
-- >>> END OF EXCEL PASTE <<<
$IDS$, '\s+') AS id_token
    WHERE trim(id_token) <> ''
);

-- ==============================================================================
-- Verification Query:
-- Check which candidates now have application = false
-- ==============================================================================
SELECT student_id, full_name, email, application
FROM public.pnms
WHERE application = false
ORDER BY full_name ASC;
