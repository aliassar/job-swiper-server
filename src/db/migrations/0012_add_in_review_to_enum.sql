-- Migration: Simplify application_stage_enum to 6 values
-- New values: 'Being Applied', 'Applied', 'In Review', 'Accepted', 'Rejected', 'Withdrawn'
-- Removing: 'Syncing', 'Phone Screen', 'Interview', 'Offer'

-- Step 1: Map existing data to new stages before changing the enum
UPDATE applications
SET stage = CASE
    WHEN stage = 'Syncing' THEN 'Being Applied'
    WHEN stage = 'Phone Screen' THEN 'Applied'
    WHEN stage = 'Interview' THEN 'Applied'
    WHEN stage = 'Offer' THEN 'Accepted'
    ELSE stage
END
WHERE stage IN ('Syncing', 'Phone Screen', 'Interview', 'Offer');

-- Step 2: Create the new enum type with only the desired values
CREATE TYPE application_stage_enum_new AS ENUM (
    'Being Applied',
    'Applied',
    'In Review',
    'Accepted',
    'Rejected',
    'Withdrawn'
);

-- Step 3: Update the applications table to use the new enum type
ALTER TABLE applications 
    ALTER COLUMN stage TYPE application_stage_enum_new 
    USING stage::text::application_stage_enum_new;

-- Step 4: Drop the old enum type
DROP TYPE application_stage_enum;

-- Step 5: Rename the new enum to the original name
ALTER TYPE application_stage_enum_new RENAME TO application_stage_enum;

-- Step 6: Update the default value
ALTER TABLE applications ALTER COLUMN stage SET DEFAULT 'Being Applied';
