import { Hono } from 'hono';
import { z } from 'zod';
import { AppContext } from '../types';
import { resumeService } from '../services/resume.service';
import { formatResponse } from '../lib/utils';
import { ValidationError } from '../lib/errors';

const resumes = new Hono<AppContext>();

// GET /api/resumes - List resume files
resumes.get('/', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');

  const resumeList = await resumeService.listResumes(auth.userId);

  return c.json(formatResponse(true, resumeList, null, requestId));
});

// POST /api/resumes - Upload resume file
resumes.post('/', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');

  const formData = await c.req.formData();
  const file = formData.get('file') as File;

  if (!file) {
    throw new ValidationError('File is required');
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const resume = await resumeService.uploadResume(
    auth.userId,
    file.name,
    buffer,
    file.type
  );

  return c.json(formatResponse(true, resume, null, requestId), 201);
});

// GET /api/resumes/:id - Get resume details
resumes.get('/:id', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const resumeId = c.req.param('id');

  const resume = await resumeService.getResumeById(auth.userId, resumeId);

  return c.json(formatResponse(true, resume, null, requestId));
});

// DELETE /api/resumes/:id - Delete resume
resumes.delete('/:id', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const resumeId = c.req.param('id');

  await resumeService.deleteResume(auth.userId, resumeId);

  return c.json(
    formatResponse(true, { message: 'Resume deleted successfully' }, null, requestId)
  );
});

// PATCH /api/resumes/:id/primary - Set as primary
resumes.patch('/:id/primary', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const resumeId = c.req.param('id');

  const resume = await resumeService.setPrimary(auth.userId, resumeId);

  return c.json(formatResponse(true, resume, null, requestId));
});

export default resumes;
