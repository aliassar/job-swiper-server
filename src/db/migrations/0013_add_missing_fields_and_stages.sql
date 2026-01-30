ALTER TYPE "application_stage_enum" ADD VALUE 'CV Check';
ALTER TYPE "application_stage_enum" ADD VALUE 'Message Check';
ALTER TYPE "application_stage_enum" ADD VALUE 'Failed';

ALTER TABLE "user_profiles" ADD COLUMN "summary" text;
ALTER TABLE "user_profiles" ADD COLUMN "headline" text;
