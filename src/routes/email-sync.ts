import { Hono } from 'hono';
import { AppContext } from '../types/index.js';
import { emailSyncService } from '../services/email-sync.service.js';
import { formatResponse } from '../lib/utils.js';

const emailSync = new Hono<AppContext>();

// POST /api/email/sync - Trigger email sync
emailSync.post('/sync', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');

  const result = await emailSyncService.triggerSync(auth.userId, requestId);

  return c.json(formatResponse(true, result, null, requestId));
});

// GET /api/email/status - Get sync status
emailSync.get('/status', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');

  const status = await emailSyncService.getSyncStatus(auth.userId, requestId);

  return c.json(formatResponse(true, status, null, requestId));
});

export default emailSync;
