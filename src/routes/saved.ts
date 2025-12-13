import { Hono } from 'hono';
import { AppContext } from '../types';
import { jobService } from '../services/job.service';
import { formatResponse, parseIntSafe } from '../lib/utils';

const saved = new Hono<AppContext>();

// GET /api/saved - Get saved jobs
saved.get('/', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const page = parseIntSafe(c.req.query('page'), 1);
  const limit = parseIntSafe(c.req.query('limit'), 20);

  const result = await jobService.getSavedJobs(auth.userId, page, limit);

  return c.json(formatResponse(true, result, null, requestId));
});

export default saved;
