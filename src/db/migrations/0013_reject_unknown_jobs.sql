-- Migration: Reject jobs with Unknown company AND position
-- This prevents garbage job data from being inserted into the database

-- Create trigger function to reject Unknown jobs
CREATE OR REPLACE FUNCTION reject_unknown_jobs()
RETURNS TRIGGER AS $$
BEGIN
    -- Reject if BOTH company AND position are 'Unknown' (case-insensitive)
    IF LOWER(NEW.company) = 'unknown' AND LOWER(NEW.position) = 'unknown' THEN
        RAISE EXCEPTION 'Jobs with Unknown company AND position are not allowed';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to run before INSERT
DROP TRIGGER IF EXISTS reject_unknown_jobs_trigger ON jobs;
CREATE TRIGGER reject_unknown_jobs_trigger
    BEFORE INSERT ON jobs
    FOR EACH ROW
    EXECUTE FUNCTION reject_unknown_jobs();

-- Also add trigger for UPDATE to prevent updating to Unknown
DROP TRIGGER IF EXISTS reject_unknown_jobs_update_trigger ON jobs;
CREATE TRIGGER reject_unknown_jobs_update_trigger
    BEFORE UPDATE ON jobs
    FOR EACH ROW
    EXECUTE FUNCTION reject_unknown_jobs();
