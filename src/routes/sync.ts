import { Hono } from 'hono';
import { AppContext } from '../types';
import { scraperService } from '../services/scraper.service';
import { formatResponse } from '../lib/utils';

const sync = new Hono<AppContext>();

// POST /api/sync - Trigger job sync (removed auth requirement for cron)
sync.post('/', async (c) => {
  const requestId = c.get('requestId');

  const result = await scraperService.triggerJobSync(requestId);

  return c.json(formatResponse(true, result, null, requestId));
});

// GET /api/sync/status - Get last sync status
sync.get('/status', async (c) => {
  const requestId = c.get('requestId');

  const status = await scraperService.getLastSyncStatus();

  return c.json(formatResponse(true, status, null, requestId));
});

export default sync;
