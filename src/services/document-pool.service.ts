import { db } from '../lib/db.js';
import { applications, jobs } from '../db/schema.js';
import { and, eq, sql } from 'drizzle-orm';
import { workflowService } from './workflow.service.js';
import { logger } from '../middleware/logger.js';

/**
 * Keeps the newest N applications in "Being Applied" supplied with a generated
 * resume and cover letter, instead of generating for every accepted job.
 *
 * The pool is the queue you actually apply from: applications still in
 * "Being Applied", ranked by the job ad's posted_date, newest first. Documents
 * are produced only for the top N, so a job accepted while it sits outside that
 * window gets nothing. Applying to one, or accepting a newer job, shifts the
 * window and the next job without documents is generated.
 *
 * Nothing is ever deleted. Applications that already carry documents keep them
 * even after they drop out of the top N.
 *
 * To revert to the previous behaviour - generate for every accepted job - set
 * DOC_GENERATION_MODE=all. No redeploy or code change is needed.
 */

export type DocGenerationMode = 'top_n' | 'all';

export function getDocGenerationMode(): DocGenerationMode {
  return process.env.DOC_GENERATION_MODE === 'all' ? 'all' : 'top_n';
}

export function getDocPoolSize(): number {
  const parsed = parseInt(process.env.DOC_POOL_SIZE || '10', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
}

// 'pending' means the workflow row was created by acceptJob but n8n has not
// been called yet - that is precisely the state we are here to act on. Every
// other status means an attempt has already been made, so we leave it alone.
// Documents are never regenerated automatically: once anything has been
// produced, or even attempted, only the user's manual Regenerate button
// touches it again. That also stops a permanently failing job from being
// retried on every accept and every apply.
const TRIGGERABLE_STATUS = 'pending';

export interface PoolEntry {
  applicationId: string;
  jobId: string;
  company: string;
  position: string;
  /** posted_date where the ad carries one, else when the job was scraped. */
  rankedAt: Date | null;
  /**
   * True if ANY document artifact exists - generated or user-uploaded, resume
   * or cover letter. Deliberately "any", not "both": a half-finished
   * application must not be re-triggered, because n8n regenerates both.
   */
  hasAnyDocument: boolean;
}

/**
 * The current pool: newest N "Being Applied" applications by ad posted date.
 */
export async function getDocumentPool(userId: string, size = getDocPoolSize()): Promise<PoolEntry[]> {
  const rows = await db
    .select({
      applicationId: applications.id,
      jobId: applications.jobId,
      company: jobs.company,
      position: jobs.position,
      rankedAt: sql<Date | null>`coalesce(${jobs.postedDate}, ${jobs.createdAt})`,
      generatedResumeId: applications.generatedResumeId,
      generatedCoverLetterId: applications.generatedCoverLetterId,
      customResumeUrl: applications.customResumeUrl,
      customCoverLetterUrl: applications.customCoverLetterUrl,
    })
    .from(applications)
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .where(
      and(
        eq(applications.userId, userId),
        eq(applications.stage, 'Being Applied'),
        eq(applications.isArchived, false),
        eq(applications.isSavedForLater, false)
      )
    )
    // Rank by when the ad went live; where the source gave no posted_date, fall
    // back to when we scraped it rather than sorting those rows to the end.
    .orderBy(sql`coalesce(${jobs.postedDate}, ${jobs.createdAt}) DESC`)
    .limit(size);

  return rows.map((r) => ({
    applicationId: r.applicationId,
    jobId: r.jobId,
    company: r.company,
    position: r.position,
    rankedAt: r.rankedAt,
    hasAnyDocument: Boolean(
      r.generatedResumeId || r.customResumeUrl ||
      r.generatedCoverLetterId || r.customCoverLetterUrl
    ),
  }));
}

/**
 * Bring the pool up to strength: trigger generation for every application in
 * the top N that has no documents and no run already in flight.
 *
 * Safe to call repeatedly - it is a reconciliation, not a queue. Never throws;
 * a failure to top up the pool must not fail the swipe or the apply that
 * triggered it.
 */
export async function reconcileDocumentPool(
  userId: string,
  reason: string
): Promise<{ triggered: string[]; skipped: number }> {
  const triggered: string[] = [];
  let skipped = 0;

  try {
    const pool = await getDocumentPool(userId);
    // Anything already carrying a document is finished as far as this service
    // is concerned - only the manual Regenerate button may replace it.
    const missing = pool.filter((entry) => !entry.hasAnyDocument);

    for (const entry of missing) {
      const existing = await workflowService.getWorkflowByApplication(entry.applicationId);

      // Any status other than 'pending' means generation was already attempted
      // for this application: in flight, completed, failed, or cancelled. None
      // of those may be re-triggered automatically.
      if (existing && existing.status !== TRIGGERABLE_STATUS) {
        skipped++;
        continue;
      }

      const workflowRun = existing
        ?? await workflowService.createWorkflowRun(userId, entry.applicationId, entry.jobId);

      const result = await workflowService.triggerN8nDocumentGeneration(
        userId,
        entry.jobId,
        entry.applicationId
      );

      if (result.success) {
        await workflowService.updateWorkflowStatus(workflowRun.id, 'generating_resume');
        triggered.push(entry.applicationId);
        logger.info(
          { userId, applicationId: entry.applicationId, company: entry.company, reason },
          'Document generation triggered for pool slot'
        );
      } else {
        logger.error(
          { userId, applicationId: entry.applicationId, error: result.error, reason },
          'Failed to trigger document generation for pool slot'
        );
      }
    }
  } catch (error) {
    logger.error({ error, userId, reason }, 'Document pool reconciliation failed');
  }

  return { triggered, skipped };
}

/**
 * Fire-and-forget reconciliation, for call sites that must stay responsive -
 * a swipe or a stage change should not wait on n8n.
 */
export function reconcileDocumentPoolInBackground(userId: string, reason: string): void {
  void reconcileDocumentPool(userId, reason);
}

export const documentPoolService = {
  getDocumentPool,
  reconcileDocumentPool,
  reconcileDocumentPoolInBackground,
  getDocGenerationMode,
  getDocPoolSize,
};
