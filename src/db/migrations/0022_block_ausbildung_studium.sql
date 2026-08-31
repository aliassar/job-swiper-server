-- Block German vocational and study-programme postings.
--
-- Measured against the full swipe history, every one of these is a clean zero:
--
--   ausbildung*                149 decided, 0 accepted
--   studium                    106 decided, 0 accepted
--   dual* studium               98 decided, 0 accepted (subset of studium)
--   azubi* / auszubildende*     25 decided, 0 accepted
--
-- Matching plain `studium` rather than `dual\w*\s+studium`: the adjacent form
-- misses "Duales Bachelor-Studium" and "Praxisint. Studium", where a word sits
-- between the two, and every non-dual `studium` title in the data is the same
-- category of posting. `student` already covers "Dualer Student".
--
-- The trailing \w* on ausbildung is what catches "Ausbildungsplatz" and
-- "Ausbildungsjahr 2027"; a bare \yausbildung\y would not, because the word
-- boundary fails against the following letter.
--
-- Only the absolute list changes. The optimistic list is carried forward
-- unchanged from 0021 so this file remains the single current definition.

CREATE OR REPLACE FUNCTION filter_unwanted_jobs()
RETURNS TRIGGER AS $$
DECLARE
  absolute_regex TEXT := '\y(working[\s\-]student|student|werkstudent(en|in)?|intern(ship)?|praktikant(en|in)?|praktikum|master.?s?[\s\-]+thesis|phd([\s\-]+(position|thesis|thethis))?|trainee|graduate|researcher|machine[\s\-]learning|head|director|scientist|manager|sap|ausbildung\w*|azubi\w*|auszubildende\w*|studium)\y';
  optimistic_regex TEXT := '\y(embedded|informatiker|data[\s\-]engineer|machine[\s\-]learning[\s\-]engineer|it[\s\-]support|analyst|principal|principle|lead|staff|associate|data[\s\-]scientist|founding|sap[\s\-]developer|devops|chief|engineering[\s\-]manager|vice[\s\-]president|vp|manager|quantit(at)?ive|consultant)\y';
  keep_job BOOLEAN;
  matched TEXT;
  alternatives TEXT[];
BEGIN
  IF NEW.position ~* absolute_regex THEN
    matched := (regexp_match(NEW.position, absolute_regex, 'i'))[1];
    PERFORM log_rejected_job(
        NEW,
        'absolute_keyword',
        format('position matched blocked keyword "%s"', matched)
    );
    RETURN NULL;
  END IF;

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
