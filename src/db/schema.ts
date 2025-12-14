import { pgTable, pgEnum, text, timestamp, boolean, integer, jsonb, uuid } from 'drizzle-orm/pg-core';

// Enums
export const userJobStatusEnum = pgEnum('user_job_status_enum', ['pending', 'accepted', 'rejected', 'skipped']);
export const applicationStageEnum = pgEnum('application_stage_enum', [
  'Syncing',
  'Being Applied',
  'Applied',
  'Phone Screen',
  'Interview',
  'Offer',
  'Rejected',
  'Accepted',
  'Withdrawn',
]);
export const reportReasonEnum = pgEnum('report_reason_enum', ['spam', 'duplicate', 'expired', 'misleading', 'other']);
export const actionTypeEnum = pgEnum('action_type_enum', [
  'accepted',
  'rejected',
  'skipped',
  'saved',
  'unsaved',
  'rollback',
  'report',
  'unreport',
  'stage_updated',
]);

// Tables

// User settings table
export const userSettings = pgTable('user_settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull().unique(),
  theme: text('theme').notNull().default('light'),
  emailNotifications: boolean('email_notifications').notNull().default(true),
  pushNotifications: boolean('push_notifications').notNull().default(true),
  automationStages: jsonb('automation_stages').notNull().default([]),
  autoGenerateResume: boolean('auto_generate_resume').notNull().default(false),
  autoGenerateCoverLetter: boolean('auto_generate_cover_letter').notNull().default(false),
  autoGenerateEmail: boolean('auto_generate_email').notNull().default(false),
  aiFilteringEnabled: boolean('ai_filtering_enabled').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Resume files table
export const resumeFiles = pgTable('resume_files', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull(),
  filename: text('filename').notNull(),
  fileUrl: text('file_url').notNull(),
  isPrimary: boolean('is_primary').notNull().default(false),
  isReference: boolean('is_reference').notNull().default(false),
  uploadedAt: timestamp('uploaded_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Job sources table
export const jobSources = pgTable('job_sources', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull().unique(),
  baseUrl: text('base_url').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Jobs table
export const jobs = pgTable('jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  sourceId: uuid('source_id').references(() => jobSources.id),
  externalId: text('external_id'),
  company: text('company').notNull(),
  position: text('position').notNull(),
  location: text('location'),
  salary: text('salary'),
  skills: jsonb('skills').notNull().default([]),
  description: text('description'),
  requirements: text('requirements'),
  benefits: text('benefits'),
  jobType: text('job_type'),
  experienceLevel: text('experience_level'),
  jobUrl: text('job_url'),
  postedDate: timestamp('posted_date'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// User job status table
export const userJobStatus = pgTable('user_job_status', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull(),
  jobId: uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  status: userJobStatusEnum('status').notNull().default('pending'),
  saved: boolean('saved').notNull().default(false),
  viewedAt: timestamp('viewed_at'),
  decidedAt: timestamp('decided_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Reported jobs table
export const reportedJobs = pgTable('reported_jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull(),
  jobId: uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  reason: reportReasonEnum('reason').notNull(),
  details: text('details'),
  reportedAt: timestamp('reported_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Applications table
export const applications = pgTable('applications', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull(),
  jobId: uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  stage: applicationStageEnum('stage').notNull().default('Syncing'),
  resumeFileId: uuid('resume_file_id').references(() => resumeFiles.id),
  generatedResumeId: uuid('generated_resume_id'),
  generatedCoverLetterId: uuid('generated_cover_letter_id'),
  notes: text('notes'),
  appliedAt: timestamp('applied_at'),
  lastUpdated: timestamp('last_updated').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Action history table
export const actionHistory = pgTable('action_history', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull(),
  jobId: uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  actionType: actionTypeEnum('action_type').notNull(),
  previousStatus: userJobStatusEnum('previous_status'),
  newStatus: userJobStatusEnum('new_status'),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Generated resumes table
export const generatedResumes = pgTable('generated_resumes', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull(),
  jobId: uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  applicationId: uuid('application_id').references(() => applications.id, { onDelete: 'cascade' }),
  baseResumeId: uuid('base_resume_id').references(() => resumeFiles.id),
  fileUrl: text('file_url').notNull(),
  filename: text('filename').notNull(),
  generatedAt: timestamp('generated_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Generated cover letters table
export const generatedCoverLetters = pgTable('generated_cover_letters', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull(),
  jobId: uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  applicationId: uuid('application_id').references(() => applications.id, { onDelete: 'cascade' }),
  fileUrl: text('file_url').notNull(),
  filename: text('filename').notNull(),
  isReference: boolean('is_reference').notNull().default(false),
  generatedAt: timestamp('generated_at').notNull().defaultNow(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Audit logs table
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id'),
  action: text('action').notNull(),
  resource: text('resource').notNull(),
  resourceId: text('resource_id'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Password reset tokens table
export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull(),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  used: boolean('used').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Sync runs table
export const syncRuns = pgTable('sync_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  status: text('status').notNull(),
  jobsScraped: integer('jobs_scraped').notNull().default(0),
  jobsAdded: integer('jobs_added').notNull().default(0),
  errors: jsonb('errors').notNull().default([]),
  startedAt: timestamp('started_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
