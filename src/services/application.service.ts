import { db } from '../lib/db';
import { applications, jobs, actionHistory } from '../db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { NotFoundError } from '../lib/errors';

export const applicationService = {
  async getApplications(userId: string, page: number = 1, limit: number = 20) {
    const offset = (page - 1) * limit;

    const items = await db
      .select({
        id: applications.id,
        stage: applications.stage,
        notes: applications.notes,
        appliedAt: applications.appliedAt,
        lastUpdated: applications.lastUpdated,
        jobId: jobs.id,
        company: jobs.company,
        position: jobs.position,
        location: jobs.location,
      })
      .from(applications)
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .where(eq(applications.userId, userId))
      .orderBy(desc(applications.lastUpdated))
      .limit(limit)
      .offset(offset);

    const totalResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(applications)
      .where(eq(applications.userId, userId));

    const total = Number(totalResult[0]?.count || 0);

    return {
      items: items.map((item) => ({
        id: item.id,
        stage: item.stage,
        notes: item.notes,
        appliedAt: item.appliedAt,
        lastUpdated: item.lastUpdated,
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
  },

  async getApplicationById(userId: string, applicationId: string) {
    const result = await db
      .select()
      .from(applications)
      .where(and(eq(applications.id, applicationId), eq(applications.userId, userId)))
      .limit(1);

    if (result.length === 0) {
      throw new NotFoundError('Application');
    }

    return result[0];
  },

  async updateApplicationStage(
    userId: string,
    applicationId: string,
    stage: 'Syncing' | 'Being Applied' | 'Applied' | 'Phone Screen' | 'Interview' | 'Offer' | 'Rejected' | 'Accepted' | 'Withdrawn'
  ) {
    const application = await this.getApplicationById(userId, applicationId);

    await db
      .update(applications)
      .set({
        stage: stage,
        lastUpdated: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(applications.id, applicationId));

    // Record action history
    await db.insert(actionHistory).values({
      userId,
      jobId: application.jobId,
      actionType: 'stage_updated',
      metadata: {
        applicationId,
        previousStage: application.stage,
        newStage: stage,
      },
    });

    return await this.getApplicationById(userId, applicationId);
  },

  async createApplication(
    userId: string,
    jobId: string,
    resumeFileId?: string
  ) {
    const result = await db
      .insert(applications)
      .values({
        userId,
        jobId,
        resumeFileId,
        stage: 'Syncing',
        lastUpdated: new Date(),
      })
      .returning();

    return result[0];
  },
};
