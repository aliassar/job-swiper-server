import { db } from '../lib/db';
import { generatedCoverLetters, jobs } from '../db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { NotFoundError } from '../lib/errors';

export const coverLetterService = {
  async listCoverLetters(userId: string) {
    const results = await db
      .select({
        id: generatedCoverLetters.id,
        jobId: generatedCoverLetters.jobId,
        filename: generatedCoverLetters.filename,
        fileUrl: generatedCoverLetters.fileUrl,
        isReference: generatedCoverLetters.isReference,
        generatedAt: generatedCoverLetters.generatedAt,
        company: jobs.company,
        position: jobs.position,
      })
      .from(generatedCoverLetters)
      .leftJoin(jobs, eq(jobs.id, generatedCoverLetters.jobId))
      .where(eq(generatedCoverLetters.userId, userId))
      .orderBy(desc(generatedCoverLetters.isReference), desc(generatedCoverLetters.generatedAt));

    return results.map((r) => ({
      id: r.id,
      jobId: r.jobId,
      filename: r.filename,
      fileUrl: r.fileUrl,
      isReference: r.isReference,
      generatedAt: r.generatedAt,
      job: r.company && r.position ? {
        company: r.company,
        position: r.position,
      } : null,
    }));
  },

  async getCoverLetterById(userId: string, coverLetterId: string) {
    const result = await db
      .select()
      .from(generatedCoverLetters)
      .where(and(eq(generatedCoverLetters.id, coverLetterId), eq(generatedCoverLetters.userId, userId)))
      .limit(1);

    if (result.length === 0) {
      throw new NotFoundError('Cover letter');
    }

    return result[0];
  },

  async setReference(userId: string, coverLetterId: string) {
    // First verify the cover letter exists and belongs to user
    await this.getCoverLetterById(userId, coverLetterId);

    // Unset all reference flags for this user
    await db
      .update(generatedCoverLetters)
      .set({ isReference: false })
      .where(eq(generatedCoverLetters.userId, userId));

    // Then set the specified cover letter as reference
    const updated = await db
      .update(generatedCoverLetters)
      .set({ isReference: true })
      .where(eq(generatedCoverLetters.id, coverLetterId))
      .returning();

    return updated[0];
  },

  async getReferenceCoverLetter(userId: string) {
    const result = await db
      .select()
      .from(generatedCoverLetters)
      .where(and(eq(generatedCoverLetters.userId, userId), eq(generatedCoverLetters.isReference, true)))
      .limit(1);

    return result.length > 0 ? result[0] : null;
  },
};
