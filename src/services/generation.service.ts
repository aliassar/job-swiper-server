import { db } from '../lib/db';
import { generatedResumes, generatedCoverLetters, jobs } from '../db/schema';
import { resumeAIClient, coverLetterAIClient } from '../lib/microservice-client';
import { storage } from '../lib/storage';
import { eq, and, desc } from 'drizzle-orm';
import { NotFoundError } from '../lib/errors';

export const generationService = {
  async generateResume(
    userId: string,
    jobId: string,
    baseResumeId: string,
    requestId?: string
  ) {
    // Get job details
    const job = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (job.length === 0) {
      throw new NotFoundError('Job');
    }

    // Call AI service
    const response = await resumeAIClient.request<{ fileBuffer: string; filename: string }>(
      '/generate',
      {
        method: 'POST',
        body: {
          jobDescription: job[0].description,
          baseResumeId,
        },
        requestId,
      }
    );

    // Upload generated file
    const buffer = Buffer.from(response.fileBuffer, 'base64');
    const key = storage.generateKey(userId, 'generated-resume', response.filename);
    const fileUrl = await storage.uploadFile(key, buffer, 'application/pdf');

    // Save to database
    const result = await db
      .insert(generatedResumes)
      .values({
        userId,
        jobId,
        baseResumeId,
        filename: response.filename,
        fileUrl,
      })
      .returning();

    return result[0];
  },

  async generateCoverLetter(
    userId: string,
    jobId: string,
    requestId?: string
  ) {
    // Get job details
    const job = await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
    if (job.length === 0) {
      throw new NotFoundError('Job');
    }

    // Call AI service
    const response = await coverLetterAIClient.request<{ fileBuffer: string; filename: string }>(
      '/generate',
      {
        method: 'POST',
        body: {
          jobDescription: job[0].description,
        },
        requestId,
      }
    );

    // Upload generated file
    const buffer = Buffer.from(response.fileBuffer, 'base64');
    const key = storage.generateKey(userId, 'cover-letter', response.filename);
    const fileUrl = await storage.uploadFile(key, buffer, 'application/pdf');

    // Save to database
    const result = await db
      .insert(generatedCoverLetters)
      .values({
        userId,
        jobId,
        filename: response.filename,
        fileUrl,
      })
      .returning();

    return result[0];
  },

  async listGeneratedResumes(userId: string) {
    const results = await db
      .select({
        id: generatedResumes.id,
        jobId: generatedResumes.jobId,
        filename: generatedResumes.filename,
        fileUrl: generatedResumes.fileUrl,
        generatedAt: generatedResumes.generatedAt,
        company: jobs.company,
        position: jobs.position,
      })
      .from(generatedResumes)
      .innerJoin(jobs, eq(jobs.id, generatedResumes.jobId))
      .where(eq(generatedResumes.userId, userId))
      .orderBy(desc(generatedResumes.generatedAt));

    return results.map((r) => ({
      id: r.id,
      jobId: r.jobId,
      filename: r.filename,
      fileUrl: r.fileUrl,
      generatedAt: r.generatedAt,
      job: {
        company: r.company,
        position: r.position,
      },
    }));
  },

  async listGeneratedCoverLetters(userId: string) {
    const results = await db
      .select({
        id: generatedCoverLetters.id,
        jobId: generatedCoverLetters.jobId,
        filename: generatedCoverLetters.filename,
        fileUrl: generatedCoverLetters.fileUrl,
        generatedAt: generatedCoverLetters.generatedAt,
        company: jobs.company,
        position: jobs.position,
      })
      .from(generatedCoverLetters)
      .innerJoin(jobs, eq(jobs.id, generatedCoverLetters.jobId))
      .where(eq(generatedCoverLetters.userId, userId))
      .orderBy(desc(generatedCoverLetters.generatedAt));

    return results.map((r) => ({
      id: r.id,
      jobId: r.jobId,
      filename: r.filename,
      fileUrl: r.fileUrl,
      generatedAt: r.generatedAt,
      job: {
        company: r.company,
        position: r.position,
      },
    }));
  },

  async getGeneratedResumeById(userId: string, resumeId: string) {
    const result = await db
      .select()
      .from(generatedResumes)
      .where(and(eq(generatedResumes.id, resumeId), eq(generatedResumes.userId, userId)))
      .limit(1);

    if (result.length === 0) {
      throw new NotFoundError('Generated resume');
    }

    return result[0];
  },

  async getGeneratedCoverLetterById(userId: string, coverLetterId: string) {
    const result = await db
      .select()
      .from(generatedCoverLetters)
      .where(and(eq(generatedCoverLetters.id, coverLetterId), eq(generatedCoverLetters.userId, userId)))
      .limit(1);

    if (result.length === 0) {
      throw new NotFoundError('Generated cover letter');
    }

    return result[0];
  },
};
