import { db } from '../lib/db';
import { jobs, userJobStatus, actionHistory } from '../db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { NotFoundError } from '../lib/errors';

export const jobService = {
  async getPendingJobs(userId: string, search?: string, limit: number = 10) {
    const query = db
      .select({
        id: jobs.id,
        company: jobs.company,
        position: jobs.position,
        location: jobs.location,
        salary: jobs.salary,
        skills: jobs.skills,
        description: jobs.description,
        requirements: jobs.requirements,
        benefits: jobs.benefits,
        jobType: jobs.jobType,
        experienceLevel: jobs.experienceLevel,
        jobUrl: jobs.jobUrl,
        postedDate: jobs.postedDate,
        status: userJobStatus.status,
        saved: userJobStatus.saved,
        viewedAt: userJobStatus.viewedAt,
        decidedAt: userJobStatus.decidedAt,
      })
      .from(jobs)
      .leftJoin(userJobStatus, and(eq(userJobStatus.jobId, jobs.id), eq(userJobStatus.userId, userId)))
      .where(sql`(${userJobStatus.status} IS NULL OR ${userJobStatus.status} = 'pending')`)
      .orderBy(desc(jobs.createdAt))
      .limit(limit);

    return await query;
  },

  async getJobWithStatus(userId: string, jobId: string) {
    const result = await db
      .select({
        id: jobs.id,
        company: jobs.company,
        position: jobs.position,
        location: jobs.location,
        salary: jobs.salary,
        skills: jobs.skills,
        description: jobs.description,
        requirements: jobs.requirements,
        benefits: jobs.benefits,
        jobType: jobs.jobType,
        experienceLevel: jobs.experienceLevel,
        jobUrl: jobs.jobUrl,
        postedDate: jobs.postedDate,
        status: userJobStatus.status,
        saved: userJobStatus.saved,
      })
      .from(jobs)
      .leftJoin(userJobStatus, and(eq(userJobStatus.jobId, jobs.id), eq(userJobStatus.userId, userId)))
      .where(eq(jobs.id, jobId))
      .limit(1);

    if (result.length === 0) {
      throw new NotFoundError('Job');
    }

    return result[0];
  },

  async updateJobStatus(
    userId: string,
    jobId: string,
    status: 'accepted' | 'rejected' | 'skipped',
    actionType: string
  ) {
    const job = await this.getJobWithStatus(userId, jobId);

    // Update or insert user job status
    const existing = await db.select().from(userJobStatus).where(
      and(eq(userJobStatus.userId, userId), eq(userJobStatus.jobId, jobId))
    ).limit(1);

    if (existing.length > 0) {
      await db
        .update(userJobStatus)
        .set({
          status,
          decidedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(userJobStatus.userId, userId), eq(userJobStatus.jobId, jobId)));
    } else {
      await db.insert(userJobStatus).values({
        userId,
        jobId,
        status,
        decidedAt: new Date(),
      });
    }

    // Record action history
    await db.insert(actionHistory).values({
      userId,
      jobId,
      actionType: actionType as any,
      previousStatus: job.status as any,
      newStatus: status,
      metadata: {},
    });

    return await this.getJobWithStatus(userId, jobId);
  },

  async toggleSave(userId: string, jobId: string) {
    const job = await this.getJobWithStatus(userId, jobId);
    const newSavedState = !job.saved;

    const existing = await db.select().from(userJobStatus).where(
      and(eq(userJobStatus.userId, userId), eq(userJobStatus.jobId, jobId))
    ).limit(1);

    if (existing.length > 0) {
      await db
        .update(userJobStatus)
        .set({
          saved: newSavedState,
          updatedAt: new Date(),
        })
        .where(and(eq(userJobStatus.userId, userId), eq(userJobStatus.jobId, jobId)));
    } else {
      await db.insert(userJobStatus).values({
        userId,
        jobId,
        saved: newSavedState,
      });
    }

    // Record action history
    await db.insert(actionHistory).values({
      userId,
      jobId,
      actionType: newSavedState ? 'saved' : 'unsaved',
      metadata: {},
    });

    return await this.getJobWithStatus(userId, jobId);
  },

  async getSavedJobs(userId: string, page: number = 1, limit: number = 20) {
    const offset = (page - 1) * limit;

    const items = await db
      .select({
        id: jobs.id,
        company: jobs.company,
        position: jobs.position,
        location: jobs.location,
        salary: jobs.salary,
        skills: jobs.skills,
        jobType: jobs.jobType,
        status: userJobStatus.status,
        saved: userJobStatus.saved,
      })
      .from(jobs)
      .innerJoin(userJobStatus, eq(userJobStatus.jobId, jobs.id))
      .where(and(eq(userJobStatus.userId, userId), eq(userJobStatus.saved, true)))
      .orderBy(desc(userJobStatus.updatedAt))
      .limit(limit)
      .offset(offset);

    const totalResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(userJobStatus)
      .where(and(eq(userJobStatus.userId, userId), eq(userJobStatus.saved, true)));

    const total = Number(totalResult[0]?.count || 0);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  async getSkippedJobs(userId: string) {
    return await db
      .select({
        id: jobs.id,
        company: jobs.company,
        position: jobs.position,
        location: jobs.location,
        status: userJobStatus.status,
      })
      .from(jobs)
      .innerJoin(userJobStatus, eq(userJobStatus.jobId, jobs.id))
      .where(and(eq(userJobStatus.userId, userId), eq(userJobStatus.status, 'skipped')))
      .orderBy(desc(userJobStatus.decidedAt));
  },
};
