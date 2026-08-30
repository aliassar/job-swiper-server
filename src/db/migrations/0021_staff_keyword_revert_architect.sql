-- Two adjustments to the title filters.
--
-- 1. staff joins the optimistic list, not the absolute one. The split matters
--    here and the data says so: "staff" with no slash accepts at 2.5% over 485
--    decisions, while "staff" alongside a / alternative accepts at 7.3% over
--    357. So "Senior / Staff Product Engineer" survives on "Senior" and
--    "Staff Software Engineer" is dropped.
--
-- 2. architect comes out of the absolute list, reverting part of 0020. It
--    measured 1.9% over 829 decisions, but 16 of those were accepted and the
--    keyword is no longer wanted as a hard block.

CREATE OR REPLACE FUNCTION filter_unwanted_jobs()
RETURNS TRIGGER AS $$
DECLARE
  absolute_regex TEXT := '\y(working[\s\-]student|student|werkstudent(en|in)?|intern(ship)?|praktikant(en|in)?|praktikum|master.?s?[\s\-]+thesis|phd([\s\-]+(position|thesis|thethis))?|trainee|graduate|researcher|machine[\s\-]learning|head|director|scientist|manager|sap)\y';
  optimistic_regex TEXT := '\y(embedded|informatiker|data[\s\-]engineer|machine[\s\-]learning[\s\-]engineer|it[\s\-]support|analyst|principal|principle|lead|staff|associate|data[\s\-]scientist|founding|sap[\s\-]developer|devops|chief|engineering[\s\-]manager|vice[\s\-]president|vp|manager|quantit(at)?ive|consultant)\y';
  keep_job BOOLEAN;
  matched TEXT;
  alternatives TEXT[];
BEGIN
  -- Absolute rejection: the keyword condemns the title outright.
  IF NEW.position ~* absolute_regex THEN
    matched := (regexp_match(NEW.position, absolute_regex, 'i'))[1];
    PERFORM log_rejected_job(
        NEW,
        'absolute_keyword',
        format('position matched blocked keyword "%s"', matched)
    );
    RETURN NULL;
  END IF;

  -- Optimistic rejection: split on / only, after removing parenthesised text.
  -- The job survives if any alternative escapes both lists.
  alternatives := regexp_split_to_array(
      regexp_replace(NEW.position, '\([^)]*\)', '', 'g'), '/');

  SELECT EXISTS (
    SELECT 1
    FROM unnest(alternatives) AS alt
    WHERE alt !~* optimistic_regex
      AND alt !~* absolute_regex
      AND trim(alt) != ''
  ) INTO keep_job;

  IF NOT keep_job THEN
    PERFORM log_rejected_job(
        NEW,
        'optimistic_keyword',
        format('no title alternative survived the filtered-role list; considered: %s',
               array_to_string(alternatives, ' | '))
    );
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
