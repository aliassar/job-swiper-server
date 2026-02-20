-- Migration: Sync application_stage_enum to match frontend
-- Removes: CV Check, Message Check, Failed
-- Keeps: Being Applied, Applied, In Review, Accepted, Rejected, Withdrawn

-- Step 1: Remap any existing rows with deprecated stages
UPDATE applications SET stage = 'Being Applied' WHERE stage IN ('CV Check', 'Message Check');
UPDATE applications SET stage = 'Rejected' WHERE stage = 'Failed';

-- Step 2: Drop the default before altering the type (PostgreSQL requirement)
ALTER TABLE applications ALTER COLUMN stage DROP DEFAULT;

-- Step 3: Create the new enum type with only 6 values
CREATE TYPE application_stage_enum_new AS ENUM (
    'Being Applied',
    'Applied',
    'In Review',
    'Accepted',
    'Rejected',
    'Withdrawn'
);

-- Step 4: Swap the column to the new type
ALTER TABLE applications
    ALTER COLUMN stage TYPE application_stage_enum_new
    USING stage::text::application_stage_enum_new;

-- Step 5: Drop the old enum and rename the new one
DROP TYPE application_stage_enum;
ALTER TYPE application_stage_enum_new RENAME TO application_stage_enum;

-- Step 6: Re-apply the default
ALTER TABLE applications ALTER COLUMN stage SET DEFAULT 'Being Applied';

