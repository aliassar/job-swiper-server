-- Migration: Add PostgreSQL trigger for job deduplication
-- This ensures duplicate jobs are prevented regardless of insertion method (API or direct database)

-- Function: Normalize text for comparison
-- Replicates the TypeScript normalizeText() logic:
-- - Converts to lowercase
-- - Trims whitespace
-- - Removes extra spaces
-- - Removes domain extensions (.com, .org, .net, etc.)
-- - Removes common company suffixes (Inc., LLC, Ltd., etc.)
CREATE OR REPLACE FUNCTION normalize_job_text(input_text TEXT)
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
    
    -- Trim whitespace
    result := TRIM(result);
    
    -- Remove extra spaces (collapse multiple spaces to single)
    result := REGEXP_REPLACE(result, '\s+', ' ', 'g');
    
    -- Remove domain extensions
    result := REGEXP_REPLACE(result, '\.(com|org|net|io|co|ai|dev|app|xyz|tech|info)\b', '', 'gi');
    
    -- Remove common company suffixes at the end
    result := REGEXP_REPLACE(result, '\s*(inc\.?|llc\.?|ltd\.?|corp\.?|corporation|company|co\.?|gmbh|ag|plc)\s*$', '', 'gi');
    
    -- Final trim
    result := TRIM(result);
    
    RETURN result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function: Extract words from text as an array
CREATE OR REPLACE FUNCTION extract_job_words(input_text TEXT)
RETURNS TEXT[] AS $$
DECLARE
    normalized TEXT;
    words TEXT[];
BEGIN
    normalized := normalize_job_text(input_text);
    
    IF normalized = '' THEN
        RETURN ARRAY[]::TEXT[];
    END IF;
    
    -- Split by whitespace and filter empty strings
    words := ARRAY(
        SELECT unnest 
        FROM unnest(STRING_TO_ARRAY(normalized, ' ')) 
        WHERE unnest != '' AND unnest IS NOT NULL
    );
    
    RETURN words;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function: Check if two word arrays are "alike"
-- Returns true if one array is a subset of the other (word-boundary matching)
CREATE OR REPLACE FUNCTION are_job_words_alike(words1 TEXT[], words2 TEXT[])
RETURNS BOOLEAN AS $$
DECLARE
    normalized1 TEXT;
    normalized2 TEXT;
    is_subset1 BOOLEAN;
    is_subset2 BOOLEAN;
BEGIN
    -- If either array is empty, they don't match
    IF array_length(words1, 1) IS NULL OR array_length(words2, 1) IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Check exact match first (join arrays and compare)
    normalized1 := array_to_string(words1, ' ');
    normalized2 := array_to_string(words2, ' ');
    
    IF normalized1 = normalized2 THEN
        RETURN TRUE;
    END IF;
    
    -- Check if words1 is a subset of words2
    is_subset1 := (SELECT bool_and(word = ANY(words2)) FROM unnest(words1) AS word);
    
    -- Check if words2 is a subset of words1
    is_subset2 := (SELECT bool_and(word = ANY(words1)) FROM unnest(words2) AS word);
    
    RETURN COALESCE(is_subset1, FALSE) OR COALESCE(is_subset2, FALSE);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function: Check if two texts are alike using word-boundary matching
CREATE OR REPLACE FUNCTION are_texts_alike(text1 TEXT, text2 TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN are_job_words_alike(extract_job_words(text1), extract_job_words(text2));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger function: Prevent duplicate job inserts
-- A job is considered duplicate if:
-- - Same external_id AND
-- - Similar company (word-boundary match) AND
-- - Similar position (word-boundary match)
CREATE OR REPLACE FUNCTION prevent_duplicate_jobs()
RETURNS TRIGGER AS $$
DECLARE
    existing_job RECORD;
    new_company_words TEXT[];
    new_position_words TEXT[];
    existing_company_words TEXT[];
    existing_position_words TEXT[];
BEGIN
    -- If no external_id, allow the insert (can't check for duplicates)
    IF NEW.external_id IS NULL OR NEW.external_id = '' THEN
        RETURN NEW;
    END IF;
    
    -- Pre-compute words for the new job
    new_company_words := extract_job_words(NEW.company);
    new_position_words := extract_job_words(NEW.position);
    
    -- Check for existing jobs with the same external_id
    FOR existing_job IN 
        SELECT company, position 
        FROM jobs 
        WHERE external_id = NEW.external_id
    LOOP
        existing_company_words := extract_job_words(existing_job.company);
        existing_position_words := extract_job_words(existing_job.position);
        
        -- If company AND position are alike, this is a duplicate
        IF are_job_words_alike(new_company_words, existing_company_words) AND
           are_job_words_alike(new_position_words, existing_position_words) THEN
            -- Return NULL to skip this insert (silently ignore duplicate)
            RETURN NULL;
        END IF;
    END LOOP;
    
    -- Not a duplicate, allow the insert
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger on the jobs table
DROP TRIGGER IF EXISTS prevent_duplicate_jobs_trigger ON jobs;
CREATE TRIGGER prevent_duplicate_jobs_trigger
    BEFORE INSERT ON jobs
    FOR EACH ROW
    EXECUTE FUNCTION prevent_duplicate_jobs();

-- Add an index on external_id for faster duplicate checks
CREATE INDEX IF NOT EXISTS jobs_external_id_idx ON jobs(external_id) WHERE external_id IS NOT NULL;
