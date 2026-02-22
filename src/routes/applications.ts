import { Hono } from 'hono';
import { z } from 'zod';
import { AppContext } from '../types/index.js';
import { applicationService } from '../services/application.service.js';
import { workflowService } from '../services/workflow.service.js';
import { formatResponse, parseIntSafe, extractS3KeyFromUrl, sanitizeSearchInput } from '../lib/utils.js';
import { ValidationError } from '../lib/errors.js';
import { storage } from '../lib/storage.js';
import { validateUuidParam } from '../middleware/validate-params.js';

const applications = new Hono<AppContext>();

// Validation schemas
const updateStageSchema = z.object({
  stage: z.enum([
    'Being Applied',
    'Applied',
    'In Review',
    'Accepted',
    'Rejected',
    'Withdrawn',
  ]),
});

const updateNotesSchema = z.object({
  notes: z.string(),
});

const updateDocumentsSchema = z.object({
  resumeUrl: z.string().url().optional().nullable(),
  coverLetterUrl: z.string().url().optional().nullable(),
});

/**
 * GET /api/applications - Get applications
 * 
 * Query parameters:
 * @param page - Page number (default: 1)
 * @param limit - Results per page (default: 20)
 * @param search - Optional search term
 * 
 * @returns Paginated list of applications
 */
// GET /api/applications/counts - Get application counts by category
applications.get('/counts', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');

  const counts = await applicationService.getApplicationCounts(auth.userId);

  return c.json(formatResponse(true, counts, null, requestId));
});

applications.get('/', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const page = parseIntSafe(c.req.query('page'), 1);
  const limit = parseIntSafe(c.req.query('limit'), 20);
  const search = sanitizeSearchInput(c.req.query('search'));

  const result = await applicationService.getApplications(auth.userId, page, limit, search);

  return c.json(formatResponse(true, result, null, requestId));
});

// GET /api/applications/archived - Get archived applications
applications.get('/archived', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const page = parseIntSafe(c.req.query('page'), 1);
  const limit = parseIntSafe(c.req.query('limit'), 20);
  const search = sanitizeSearchInput(c.req.query('search'));

  const result = await applicationService.getArchivedApplications(auth.userId, page, limit, search);

  return c.json(formatResponse(true, result, null, requestId));
});

// GET /api/applications/saved-for-later - Get saved-for-later applications
applications.get('/saved-for-later', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const page = parseIntSafe(c.req.query('page'), 1);
  const limit = parseIntSafe(c.req.query('limit'), 20);
  const search = sanitizeSearchInput(c.req.query('search'));

  const result = await applicationService.getSavedForLaterApplications(auth.userId, page, limit, search);

  return c.json(formatResponse(true, result, null, requestId));
});

/**
 * GET /api/applications/:id - Get full application details with job and documents
 * 
 * @param id - Application UUID
 * 
 * @returns Application details including job, resume, and cover letter info
 * @throws 400 - If application ID is invalid
 * @throws 404 - If application not found
 */
applications.get('/:id', validateUuidParam('id'), async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const applicationId = c.req.param('id');

  const application = await applicationService.getApplicationDetails(auth.userId, applicationId);

  return c.json(formatResponse(true, application, null, requestId));
});

/**
 * PUT /api/applications/:id/stage - Update application stage
 * 
 * @param id - Application UUID
 * 
 * Request body:
 * @param stage - New stage value
 * 
 * @returns Updated application
 * @throws 400 - If application ID or stage is invalid
 * @throws 404 - If application not found
 */
applications.put('/:id/stage', validateUuidParam('id'), async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const applicationId = c.req.param('id');

  const body = await c.req.json();
  const validated = updateStageSchema.safeParse(body);

  if (!validated.success) {
    throw new ValidationError('Invalid request body', validated.error.errors);
  }

  const application = await applicationService.updateApplicationStage(
    auth.userId,
    applicationId,
    validated.data.stage
  );

  return c.json(formatResponse(true, application, null, requestId));
});

/**
 * PUT /api/applications/:id/notes - Update notes
 * 
 * @param id - Application UUID
 * 
 * Request body:
 * @param notes - Notes text
 * 
 * @returns Updated application
 * @throws 400 - If application ID is invalid
 * @throws 404 - If application not found
 */
applications.put('/:id/notes', validateUuidParam('id'), async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const applicationId = c.req.param('id');

  const body = await c.req.json();
  const validated = updateNotesSchema.safeParse(body);

  if (!validated.success) {
    throw new ValidationError('Invalid request body', validated.error.errors);
  }

  const application = await applicationService.updateApplicationNotes(
    auth.userId,
    applicationId,
    validated.data.notes
  );

  return c.json(formatResponse(true, application, null, requestId));
});

// CV and Message verification routes removed - no longer needed with simplified stages

// GET /api/applications/:id/download/resume - Download generated resume
applications.get('/:id/download/resume', validateUuidParam('id'), async (c) => {
  const auth = c.get('auth');
  const applicationId = c.req.param('id');

  const application = await applicationService.getApplicationDetails(auth.userId, applicationId);

  if (!application.generatedResume) {
    throw new ValidationError('No generated resume found');
  }

  // Get presigned URL for download
  const key = extractS3KeyFromUrl(application.generatedResume.fileUrl);
  const downloadUrl = await storage.getPresignedUrl(key);

  return c.redirect(downloadUrl);
});

// GET /api/applications/:id/download/cover-letter - Download cover letter
applications.get('/:id/download/cover-letter', validateUuidParam('id'), async (c) => {
  const auth = c.get('auth');
  const applicationId = c.req.param('id');

  const application = await applicationService.getApplicationDetails(auth.userId, applicationId);

  if (!application.generatedCoverLetter) {
    throw new ValidationError('No generated cover letter found');
  }

  // Get presigned URL for download
  const key = extractS3KeyFromUrl(application.generatedCoverLetter.fileUrl);
  const downloadUrl = await storage.getPresignedUrl(key);

  return c.redirect(downloadUrl);
});

// POST /api/applications/:id/toggle-auto-status - Toggle auto status for application
applications.post('/:id/toggle-auto-status', validateUuidParam('id'), async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const applicationId = c.req.param('id');

  const application = await applicationService.toggleAutoStatus(auth.userId, applicationId);

  return c.json(formatResponse(true, application, null, requestId));
});

// GET /api/applications/:id/documents - Get application documents
applications.get('/:id/documents', validateUuidParam('id'), async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const applicationId = c.req.param('id');

  const application = await applicationService.getApplicationDetails(auth.userId, applicationId);

  const documents = {
    generatedResume: application.generatedResume ? {
      fileUrl: application.generatedResume.fileUrl,
      fileName: application.generatedResume.filename,
      createdAt: application.generatedResume.createdAt,
    } : null,
    generatedCoverLetter: application.generatedCoverLetter ? {
      fileUrl: application.generatedCoverLetter.fileUrl,
      fileName: application.generatedCoverLetter.filename,
      createdAt: application.generatedCoverLetter.createdAt,
    } : null,
    customResumeUrl: application.customResumeUrl,
    customCoverLetterUrl: application.customCoverLetterUrl,
  };

  return c.json(formatResponse(true, documents, null, requestId));
});

// PUT /api/applications/:id/documents - Update custom document URLs
applications.put('/:id/documents', validateUuidParam('id'), async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const applicationId = c.req.param('id');

  const body = await c.req.json();
  const validated = updateDocumentsSchema.safeParse(body);

  if (!validated.success) {
    throw new ValidationError('Invalid request body', validated.error.errors);
  }

  const application = await applicationService.updateCustomDocuments(
    auth.userId,
    applicationId,
    validated.data.resumeUrl,
    validated.data.coverLetterUrl
  );

  return c.json(formatResponse(true, application, null, requestId));
});

// DELETE /api/applications/:id - Delete application and revert job to pending
applications.delete('/:id', validateUuidParam('id'), async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const applicationId = c.req.param('id');

  const result = await applicationService.deleteApplication(auth.userId, applicationId);

  return c.json(formatResponse(true, result, null, requestId));
});

// POST /api/applications/:id/regenerate - Regenerate resume and cover letter via n8n
applications.post('/:id/regenerate', validateUuidParam('id'), async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const applicationId = c.req.param('id');

  // Get application to find the jobId
  const application = await applicationService.getApplicationById(auth.userId, applicationId);

  // Trigger n8n document generation
  const result = await workflowService.triggerN8nDocumentGeneration(
    auth.userId,
    application.jobId,
    applicationId
  );

  if (!result.success) {
    throw new ValidationError(result.error || 'Failed to trigger document generation');
  }

  return c.json(formatResponse(true, { message: 'Document regeneration triggered' }, null, requestId));
});

// POST /api/applications/:id/archive - Toggle archive status
applications.post('/:id/archive', validateUuidParam('id'), async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const applicationId = c.req.param('id');

  const result = await applicationService.toggleArchive(auth.userId, applicationId);

  return c.json(formatResponse(true, result, null, requestId));
});

// POST /api/applications/:id/save-for-later - Toggle save-for-later status
applications.post('/:id/save-for-later', validateUuidParam('id'), async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const applicationId = c.req.param('id');

  const result = await applicationService.toggleSaveForLater(auth.userId, applicationId);

  return c.json(formatResponse(true, result, null, requestId));
});

export default applications;
