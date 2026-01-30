-- Migration: Simplify application stages
-- Removes: Syncing, CV Check, Message Check, Interview 1, Next Interviews, Offer, Failed
-- Keeps: Being Applied, Applied, In Review, Accepted, Rejected, Withdrawn

-- Step 1: Map existing stages to new simplified stages
UPDATE applications
SET stage = CASE
    -- Map Syncing and intermediate stages to Being Applied
    WHEN stage = 'Syncing' THEN 'Being Applied'
    WHEN stage = 'CV Check' THEN 'Being Applied'
    WHEN stage = 'Message Check' THEN 'Being Applied'
    -- Keep Being Applied as is
    WHEN stage = 'Being Applied' THEN 'Being Applied'
    -- Keep Applied as is
    WHEN stage = 'Applied' THEN 'Applied'
    -- Map Interview stages to In Review
    WHEN stage = 'Interview 1' THEN 'In Review'
    WHEN stage = 'Next Interviews' THEN 'In Review'
    WHEN stage = 'Interview' THEN 'In Review'
    WHEN stage = 'Phone Screen' THEN 'In Review'
    -- Map Offer to Accepted (user can manually change if they decline)
    WHEN stage = 'Offer' THEN 'Accepted'
    -- Map Failed to Rejected
    WHEN stage = 'Failed' THEN 'Rejected'
    -- Keep terminal stages as is
    WHEN stage = 'Accepted' THEN 'Accepted'
    WHEN stage = 'Rejected' THEN 'Rejected'
    WHEN stage = 'Withdrawn' THEN 'Withdrawn'
    -- Default to Being Applied for any unknown stages
    ELSE 'Being Applied'
END;

-- Step 2: Update the default value for the stage column
ALTER TABLE applications ALTER COLUMN stage SET DEFAULT 'Being Applied';

-- Note: The PostgreSQL enum type can be updated in a separate migration
-- or kept as is since Drizzle will handle enum values at the application level.
-- To fully clean up the enum, you would need to:
-- 1. Create a new enum with only the new values
-- 2. Update the column to use the new enum
-- 3. Drop the old enum
-- This is a more complex migration that should be done carefully in production.
