import { Hono } from 'hono';
import { AppContext } from '../types';
import { jobService } from '../services/job.service';
import { formatResponse, parseIntSafe } from '../lib/utils';
import { ValidationError } from '../lib/errors';

const saved = new Hono<AppContext>();

// GET /api/saved - Get saved jobs
saved.get('/', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const page = parseIntSafe(c.req.query('page'), 1);
  const limit = parseIntSafe(c.req.query('limit'), 20);
  const search = c.req.query('search');

  const result = await jobService.getSavedJobs(auth.userId, page, limit, search);

  return c.json(formatResponse(true, result, null, requestId));
});

// GET /api/saved/export - Export saved jobs to CSV or PDF
saved.get('/export', async (c) => {
  const auth = c.get('auth');
  const format = c.req.query('format');
  const search = c.req.query('search');

  if (!format || !['csv', 'pdf'].includes(format)) {
    throw new ValidationError('Invalid format. Must be csv or pdf.');
  }

  // Get all saved jobs (no pagination for export)
  const result = await jobService.getSavedJobs(auth.userId, 1, 10000, search);

  if (format === 'csv') {
    const csvContent = await jobService.exportSavedJobsToCSV(result.items);
    
    c.header('Content-Type', 'text/csv');
    c.header('Content-Disposition', `attachment; filename="saved-jobs-${Date.now()}.csv"`);
    return c.text(csvContent);
  } else {
    const pdfBuffer = await jobService.exportSavedJobsToPDF(result.items);
    
    return new Response(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="saved-jobs-${Date.now()}.pdf"`,
      },
    });
  }
});

export default saved;
