import { Hono } from 'hono';
import { AppContext } from '../types';
import { db } from '../lib/db';
import { reportedJobs, jobs } from '../db/schema';
import { formatResponse, parseIntSafe } from '../lib/utils';
import { eq, desc, sql, and, or, like, SQL } from 'drizzle-orm';

const reported = new Hono<AppContext>();

// GET /api/reported - Get reported jobs
reported.get('/', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');
  const page = parseIntSafe(c.req.query('page'), 1);
  const limit = parseIntSafe(c.req.query('limit'), 20);
  const search = c.req.query('search');

  const offset = (page - 1) * limit;

  let whereConditions = eq(reportedJobs.userId, auth.userId);

  const items = await db
    .select({
      id: reportedJobs.id,
      reason: reportedJobs.reason,
      details: reportedJobs.details,
      reportedAt: reportedJobs.reportedAt,
      jobId: jobs.id,
      company: jobs.company,
      position: jobs.position,
      location: jobs.location,
    })
    .from(reportedJobs)
    .innerJoin(jobs, eq(jobs.id, reportedJobs.jobId))
    .where(
      search
        ? and(
            whereConditions,
            or(like(jobs.company, `%${search}%`), like(jobs.position, `%${search}%`))
          )
        : whereConditions
    )
    .orderBy(desc(reportedJobs.reportedAt))
    .limit(limit)
    .offset(offset);

  let countWhereConditions: SQL<unknown> | undefined = eq(reportedJobs.userId, auth.userId);

  if (search) {
    countWhereConditions = and(
      countWhereConditions,
      sql`EXISTS (
        SELECT 1 FROM ${jobs} 
        WHERE ${jobs.id} = ${reportedJobs.jobId} 
        AND (${like(jobs.company, `%${search}%`)} OR ${like(jobs.position, `%${search}%`)})
      )`
    );
  }

  const totalResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(reportedJobs)
    .where(countWhereConditions);

  const total = Number(totalResult[0]?.count || 0);

  const result = {
    items: items.map((item) => ({
      id: item.id,
      reason: item.reason,
      details: item.details,
      reportedAt: item.reportedAt,
      job: {
        id: item.jobId,
        company: item.company,
        position: item.position,
        location: item.location,
      },
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };

  return c.json(formatResponse(true, result, null, requestId));
});

export default reported;
