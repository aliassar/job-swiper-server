-- Extend the title keyword filters using measured accept rates.
--
-- Baseline accept rate across 32,255 decided jobs is 11.4%. Every keyword added
-- to the absolute list below sits under 2% over at least 250 decisions:
--
--   researcher 0.0% (252) · machine/learning 0.0-0.2% (402/534) · head 0.3% (380)
--   director 0.4% (277) · scientist 0.6% (785) · manager 1.0% (1389)
--   sap 1.4% (347) · architect 1.8% (827)
--
-- lead (0.9%, 1055), principal (1.1%, 368) and associate (1.5%, 336) stay in the
-- optimistic list rather than the absolute one, because a title like
-- "Senior / Lead Engineer" offers a real choice of level and should survive.
--
-- The optimistic split character set narrows from [/|,] to / alone. Splitting on
-- commas and pipes handed almost any title an escape route: "Lead Product
-- Manager, Paid Search" survived on "Paid Search", and
-- "... Delivery Lead Specialist | Data & Analytics | Germany" survived on
-- "Germany". A slash is the separator that actually denotes alternative levels.

CREATE OR REPLACE FUNCTION filter_unwanted_jobs()
RETURNS TRIGGER AS $$
DECLARE
  absolute_regex TEXT := '\y(working[\s\-]student|student|werkstudent(en|in)?|intern(ship)?|praktikant(en|in)?|praktikum|master.?s?[\s\-]+thesis|phd([\s\-]+(position|thesis|thethis))?|trainee|graduate|researcher|machine[\s\-]learning|head|director|scientist|manager|sap|architect)\y';
  optimistic_regex TEXT := '\y(embedded|informatiker|data[\s\-]engineer|machine[\s\-]learning[\s\-]engineer|it[\s\-]support|analyst|principal|principle|lead|associate|data[\s\-]scientist|founding|sap[\s\-]developer|devops|chief|engineering[\s\-]manager|vice[\s\-]president|vp|manager|quantit(at)?ive|consultant)\y';
  keep_job BOOLEAN;
  matched TEXT;
  alternatives TEXT[];
BEGIN
  -- Absolute rejection: the keyword condemns the title outright, whatever else
  -- the title says.
  IF NEW.position ~* absolute_regex THEN
    matched := (regexp_match(NEW.position, absolute_regex, 'i'))[1];
    PERFORM log_rejected_job(
        NEW,
        'absolute_keyword',
        format('position matched blocked keyword "%s"', matched)
    );
    RETURN NULL;
  END IF;

  -- Optimistic rejection: split on / only - the separator that denotes
  -- alternative seniority levels - after removing parenthesised text. The job
  -- survives if any alternative escapes the filtered-role list, so
  -- "Senior / Lead Engineer" is kept on "Senior" while "Lead Data Engineer" is
  -- dropped.
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
