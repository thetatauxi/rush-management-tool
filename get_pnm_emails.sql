-- ==============================================================================
-- Fetch PNM Emails by Application Status (For Google Sheets / Excel)
-- System: Rush Management Tool (RMT)
-- ==============================================================================

-- ==============================================================================
-- PART 1: SUBMITTED PNMs (Application = TRUE)
-- ==============================================================================
-- Standard column query (select rows and copy the column from Supabase table view)
SELECT email
FROM public.pnms
WHERE application IS TRUE
  AND email IS NOT NULL
  AND trim(email) <> ''
ORDER BY email ASC;


-- ==============================================================================
-- PART 2: NON-SUBMITTED PNMs (Application = FALSE)
-- ==============================================================================
-- Standard column query (select rows and copy the column from Supabase table view)
SELECT email
FROM public.pnms
WHERE application IS FALSE
  AND email IS NOT NULL
  AND trim(email) <> ''
ORDER BY email ASC;


-- ==============================================================================
-- BONUS: 1-Click Copy-Paste Queries
-- (Returns all emails newline-separated in a single cell so you can click "Copy"
--  and paste straight into a column in Excel/Sheets without selecting multiple rows)
-- ==============================================================================

-- 1-Click Copy: Submitted Emails
SELECT string_agg(trim(email), E'\n' ORDER BY trim(email)) AS submitted_emails
FROM public.pnms
WHERE application IS TRUE
  AND email IS NOT NULL
  AND trim(email) <> '';

-- 1-Click Copy: Non-Submitted Emails
SELECT string_agg(trim(email), E'\n' ORDER BY trim(email)) AS non_submitted_emails
FROM public.pnms
WHERE application IS FALSE
  AND email IS NOT NULL
  AND trim(email) <> '';
