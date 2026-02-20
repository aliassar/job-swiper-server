-- Add apply click tracking columns to applications table
ALTER TABLE applications ADD COLUMN IF NOT EXISTS apply_clicked_at TIMESTAMP;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS apply_confirmed BOOLEAN;
