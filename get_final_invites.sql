-- ==============================================================================
-- Section 1 Final Invites Export (Rounds 1 & 2 Approved Candidates)
-- System: Rush Management Tool (RMT)
-- Description:
--   Fetches all candidates approved for an invite across Section 1 (Rounds 1 & 2).
--   Run in Supabase SQL Editor and copy/paste directly into your spreadsheet.
-- ==============================================================================

-- ==============================================================================
-- 1. COPY NAMES COLUMN (Alphabetical)
-- ==============================================================================
SELECT p.full_name
FROM (
    SELECT id FROM public."voting-s1-r1" WHERE status = 'approved'
    UNION
    SELECT id FROM public."voting-s1-r2" WHERE status = 'approved'
) invites
JOIN public.pnms p ON p.student_id = invites.id
ORDER BY p.full_name ASC;


-- ==============================================================================
-- 2. COPY EMAILS COLUMN (Alphabetical by Name)
-- ==============================================================================
SELECT p.email
FROM (
    SELECT id FROM public."voting-s1-r1" WHERE status = 'approved'
    UNION
    SELECT id FROM public."voting-s1-r2" WHERE status = 'approved'
) invites
JOIN public.pnms p ON p.student_id = invites.id
ORDER BY p.full_name ASC;


-- ==============================================================================
-- 3. COPY STUDENT IDs COLUMN
-- ==============================================================================
SELECT p.student_id
FROM (
    SELECT id FROM public."voting-s1-r1" WHERE status = 'approved'
    UNION
    SELECT id FROM public."voting-s1-r2" WHERE status = 'approved'
) invites
JOIN public.pnms p ON p.student_id = invites.id
ORDER BY p.full_name ASC;


-- ==============================================================================
-- 4. COMPLETE SPREADSHEET TABLE (Name, Email, Student ID, Major, Year, Round)
-- ==============================================================================
WITH approved_candidates AS (
    SELECT id, 'Round 1' AS approved_in_round, 1 AS round_order
    FROM public."voting-s1-r1"
    WHERE status = 'approved'

    UNION

    SELECT id, 'Round 2' AS approved_in_round, 2 AS round_order
    FROM public."voting-s1-r2"
    WHERE status = 'approved'
),
deduped_invites AS (
    SELECT DISTINCT ON (id) 
        id, 
        approved_in_round
    FROM approved_candidates
    ORDER BY id, round_order ASC
)
SELECT 
    p.full_name       AS "Full Name",
    p.email           AS "Email",
    p.student_id      AS "Student ID",
    p.major           AS "Major",
    p.year            AS "Year",
    di.approved_in_round AS "Approved In"
FROM deduped_invites di
JOIN public.pnms p ON p.student_id = di.id
ORDER BY p.full_name ASC;


-- ==============================================================================
-- 5. BONUS: 1-CLICK COPY (Single cell with all values separated by newline)
--    Copy the cell value and paste into an entire Excel / Google Sheets column!
-- ==============================================================================

-- 1-Click Names:
SELECT string_agg(p.full_name, E'\n' ORDER BY p.full_name ASC) AS invite_names_column
FROM (
    SELECT id FROM public."voting-s1-r1" WHERE status = 'approved'
    UNION
    SELECT id FROM public."voting-s1-r2" WHERE status = 'approved'
) invites
JOIN public.pnms p ON p.student_id = invites.id;

-- 1-Click Emails:
SELECT string_agg(p.email, E'\n' ORDER BY p.full_name ASC) AS invite_emails_column
FROM (
    SELECT id FROM public."voting-s1-r1" WHERE status = 'approved'
    UNION
    SELECT id FROM public."voting-s1-r2" WHERE status = 'approved'
) invites
JOIN public.pnms p ON p.student_id = invites.id;
