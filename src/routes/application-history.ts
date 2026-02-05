import { Hono } from 'hono';
import { AppContext } from '../types/index.js';
import { applicationService } from '../services/application.service.js';
import { formatResponse, parseIntSafe } from '../lib/utils.js';
import { ValidationError, NotFoundError } from '../lib/errors.js';
import { db } from '../lib/db.js';
import { applications } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

const applicationHistory = new Hono<AppContext>();

// GET /api/application-history - Query params: startDate, endDate, search, stage, page, limit
applicationHistory.get('/', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');

  const startDate = c.req.query('startDate') ? new Date(c.req.query('startDate')!) : undefined;
  const endDate = c.req.query('endDate') ? new Date(c.req.query('endDate')!) : undefined;
  const search = c.req.query('search');
  const stage = c.req.query('stage');
  const page = parseIntSafe(c.req.query('page'), 1);
  const limit = parseIntSafe(c.req.query('limit'), 20);

  const result = await applicationService.getApplicationHistory(auth.userId, {
    startDate,
    endDate,
    search,
    stage,
    page,
    limit,
  });

  return c.json(formatResponse(true, result, null, requestId));
});

// GET /api/application-history/export - Query params: format (csv/pdf), date filters
applicationHistory.get('/export', async (c) => {
  const auth = c.get('auth');

  const format = c.req.query('format');
  const startDate = c.req.query('startDate') ? new Date(c.req.query('startDate')!) : undefined;
  const endDate = c.req.query('endDate') ? new Date(c.req.query('endDate')!) : undefined;
  const search = c.req.query('search');
  const stage = c.req.query('stage');

  if (!format || !['csv', 'pdf'].includes(format)) {
    throw new ValidationError('Invalid format. Must be csv or pdf.');
  }

  // Get all applications with filters (no pagination for export)
  const result = await applicationService.getApplicationHistory(auth.userId, {
    startDate,
    endDate,
    search,
    stage,
    page: 1,
    limit: 10000, // Get all
  });

  if (format === 'csv') {
    const csvContent = await applicationService.exportApplicationsToCSV(result.items);

    c.header('Content-Type', 'text/csv');
    c.header('Content-Disposition', `attachment; filename="applications-${Date.now()}.csv"`);
    return c.text(csvContent);
  } else {
    const pdfBuffer = await applicationService.exportApplicationsToPDF(result.items);

    return new Response(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="applications-${Date.now()}.pdf"`,
      },
    });
  }
});

// GET /api/application-history/:applicationId/download/:type
// Download resume or cover letter for an application
applicationHistory.get('/:applicationId/download/:type', async (c) => {
  const auth = c.get('auth');
  const applicationId = c.req.param('applicationId');
  const type = c.req.param('type'); // 'resume' or 'cover-letter'

  if (!['resume', 'cover-letter'].includes(type)) {
    throw new ValidationError('Invalid type. Must be "resume" or "cover-letter".');
  }

  // Get application and verify ownership
  const [app] = await db
    .select()
    .from(applications)
    .where(and(eq(applications.id, applicationId), eq(applications.userId, auth.userId)))
    .limit(1);

  if (!app) {
    throw new NotFoundError('Application');
  }

  const url = type === 'resume' ? app.customResumeUrl : app.customCoverLetterUrl;

  if (!url) {
    throw new NotFoundError(`${type === 'resume' ? 'Resume' : 'Cover letter'} not found for this application`);
  }

  // Fetch the file from S3/Cloudflare
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch document: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  const filename = type === 'resume' ? 'resume.pdf' : 'cover_letter.pdf';

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
});

export default applicationHistory;

