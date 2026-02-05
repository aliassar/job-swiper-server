import { Hono } from 'hono';
import { AppContext } from '../types/index.js';
import { db } from '../lib/db.js';
import { actionHistory, jobs } from '../db/schema.js';
import { formatResponse } from '../lib/utils.js';
import { eq, desc } from 'drizzle-orm';

const history = new Hono<AppContext>();

// GET /api/history - Get action history
history.get('/', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');

  const items = await db
    .select({
      id: actionHistory.id,
      actionType: actionHistory.actionType,
      previousStatus: actionHistory.previousStatus,
      newStatus: actionHistory.newStatus,
      metadata: actionHistory.metadata,
      createdAt: actionHistory.createdAt,
      jobId: jobs.id,
      company: jobs.company,
      position: jobs.position,
    })
    .from(actionHistory)
    .innerJoin(jobs, eq(jobs.id, actionHistory.jobId))
    .where(eq(actionHistory.userId, auth.userId))
    .orderBy(desc(actionHistory.createdAt))
    .limit(100);

  const result = items.map((item) => ({
    id: item.id,
    actionType: item.actionType,
    previousStatus: item.previousStatus,
    newStatus: item.newStatus,
    metadata: item.metadata,
    createdAt: item.createdAt,
    job: {
      id: item.jobId,
      company: item.company,
      position: item.position,
    },
  }));

  return c.json(formatResponse(true, result, null, requestId));
});

export default history;
