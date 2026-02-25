-- Migration: Loose deduplication with duplicate_jobs table
-- Instead of silently dropping duplicates, move them to a separate table.
-- "Duplicate" = same company + same position after stripping noise like (m/w/d), commas, etc.

-- 1. Create the duplicate_jobs table (mirrors jobs + metadata)
CREATE TABLE IF NOT EXISTS duplicate_jobs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    original_job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
    -- Same columns as jobs table
    source_id UUID REFERENCES job_sources(id),
    external_id TEXT,
    company TEXT NOT NULL,
    position TEXT NOT NULL,
    location TEXT,
    salary TEXT,
    salary_min INTEGER,
    salary_max INTEGER,
    required_skills JSONB NOT NULL DEFAULT '[]'::jsonb,
    optional_skills JSONB NOT NULL DEFAULT '[]'::jsonb,
    description TEXT,
    short_description TEXT,
    requirements TEXT,
    benefits TEXT,
    job_type TEXT,
    experience_level TEXT,
    job_url TEXT,
    posted_date TIMESTAMP,
    logo_url TEXT,
    src_name TEXT,
    apply_link TEXT,
    german_requirement TEXT,
    years_of_experience TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    -- Dedup metadata
    detected_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS duplicate_jobs_original_job_id_idx ON duplicate_jobs(original_job_id);
CREATE INDEX IF NOT EXISTS duplicate_jobs_company_idx ON duplicate_jobs(company);

-- 2. Create the normalization function for dedup comparison
-- Strips: gender tags (m/w/d etc.), commas, extra whitespace, trailing punctuation
CREATE OR REPLACE FUNCTION normalize_for_dedup(input_text TEXT)
RETURNS TEXT AS $$
DECLARE
    result TEXT;
BEGIN
    IF input_text IS NULL OR input_text = '' THEN
        RETURN '';
    END IF;

    result := input_text;

    -- Convert to lowercase
    result := LOWER(result);

    -- Remove gender tags: (m/w/d), (m/f/d), (m/f/x), (w/m/d), (w/m/x), (f/m/d), (f/m/x), (all genders), (gn), etc.
    result := REGEXP_REPLACE(result, '\s*\(\s*[mwfx]\s*/\s*[mwfx]\s*/\s*[mwfdx]\s*\)', '', 'gi');
    result := REGEXP_REPLACE(result, '\s*\(\s*[mwfx]\s*/\s*[mwfx]\s*\)', '', 'gi');
    result := REGEXP_REPLACE(result, '\s*\(\s*all\s+genders?\s*\)', '', 'gi');
    result := REGEXP_REPLACE(result, '\s*\(\s*gn\s*\)', '', 'gi');
    result := REGEXP_REPLACE(result, '\s*\(\s*d/f/m\s*\)', '', 'gi');
    result := REGEXP_REPLACE(result, '\s*\(\s*d/m/f\s*\)', '', 'gi');

    -- Remove commas
    result := REPLACE(result, ',', '');

    -- Remove trailing dots/periods
    result := REGEXP_REPLACE(result, '\.+$', '');

    -- Collapse multiple spaces to single space
    result := REGEXP_REPLACE(result, '\s+', ' ', 'g');

    -- Trim
    result := TRIM(result);

    RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 3. Replace the existing trigger function with loose dedup logic
CREATE OR REPLACE FUNCTION prevent_duplicate_jobs()
RETURNS TRIGGER AS $$
DECLARE
    existing_job RECORD;
    new_company_norm TEXT;
    new_position_norm TEXT;
BEGIN
    -- Normalize the new job's company and position
    new_company_norm := normalize_for_dedup(NEW.company);
    new_position_norm := normalize_for_dedup(NEW.position);

    -- Skip if either is empty after normalization
    IF new_company_norm = '' OR new_position_norm = '' THEN
        RETURN NEW;
    END IF;

    -- Look for an existing job with the same normalized company + position
    SELECT id, company, position INTO existing_job
    FROM jobs
    WHERE normalize_for_dedup(company) = new_company_norm
      AND normalize_for_dedup(position) = new_position_norm
    LIMIT 1;

    IF FOUND THEN
        -- It's a duplicate — move to duplicate_jobs table
        INSERT INTO duplicate_jobs (
            original_job_id, source_id, external_id, company, position,
            location, salary, salary_min, salary_max,
            required_skills, optional_skills, description, short_description,
            requirements, benefits, job_type, experience_level, job_url,
            posted_date, logo_url, src_name, apply_link,
            german_requirement, years_of_experience
        ) VALUES (
            existing_job.id, NEW.source_id, NEW.external_id, NEW.company, NEW.position,
            NEW.location, NEW.salary, NEW.salary_min, NEW.salary_max,
            NEW.required_skills, NEW.optional_skills, NEW.description, NEW.short_description,
            NEW.requirements, NEW.benefits, NEW.job_type, NEW.experience_level, NEW.job_url,
            NEW.posted_date, NEW.logo_url, NEW.src_name, NEW.apply_link,
            NEW.german_requirement, NEW.years_of_experience
        );

        -- Skip the insert into jobs
        RETURN NULL;
    END IF;

    -- Not a duplicate, allow the insert
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Recreate the trigger (same as before, just updated function)
DROP TRIGGER IF EXISTS prevent_duplicate_jobs_trigger ON jobs;
CREATE TRIGGER prevent_duplicate_jobs_trigger
    BEFORE INSERT ON jobs
    FOR EACH ROW
    EXECUTE FUNCTION prevent_duplicate_jobs();

-- 5. Add a functional index for fast dedup lookups
CREATE INDEX IF NOT EXISTS jobs_dedup_company_idx ON jobs (normalize_for_dedup(company));
CREATE INDEX IF NOT EXISTS jobs_dedup_position_idx ON jobs (normalize_for_dedup(position));
