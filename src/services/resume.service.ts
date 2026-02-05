import { db } from '../lib/db.js';
import { resumeFiles } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { storage } from '../lib/storage.js';
import { NotFoundError } from '../lib/errors.js';

export const resumeService = {
  async listResumes(userId: string) {
    return await db
      .select()
      .from(resumeFiles)
      .where(eq(resumeFiles.userId, userId))
      .orderBy(desc(resumeFiles.isPrimary), desc(resumeFiles.uploadedAt));
  },

  async getResumeById(userId: string, resumeId: string) {
    const result = await db
      .select()
      .from(resumeFiles)
      .where(and(eq(resumeFiles.id, resumeId), eq(resumeFiles.userId, userId)))
      .limit(1);

    if (result.length === 0) {
      throw new NotFoundError('Resume');
    }

    return result[0];
  },

  async uploadResume(userId: string, filename: string, buffer: Buffer, contentType: string) {
    const key = storage.generateKey(userId, 'resume', filename);
    const fileUrl = await storage.uploadFile(key, buffer, contentType);

    const result = await db
      .insert(resumeFiles)
      .values({
        userId,
        filename,
        fileUrl,
        isPrimary: false,
      })
      .returning();

    return result[0];
  },

  async deleteResume(userId: string, resumeId: string) {
    const resume = await this.getResumeById(userId, resumeId);

    // Extract key from URL for deletion
    const url = new URL(resume.fileUrl);
    const key = url.pathname.substring(1);

    await storage.deleteFile(key);

    await db
      .delete(resumeFiles)
      .where(eq(resumeFiles.id, resumeId));
  },

  async setPrimary(userId: string, resumeId: string) {
    // First, unset all primary flags for this user
    await db
      .update(resumeFiles)
      .set({ isPrimary: false, updatedAt: new Date() })
      .where(eq(resumeFiles.userId, userId));

    // Then set the specified resume as primary
    await db
      .update(resumeFiles)
      .set({ isPrimary: true, updatedAt: new Date() })
      .where(eq(resumeFiles.id, resumeId));

    return await this.getResumeById(userId, resumeId);
  },

  async setReference(userId: string, resumeId: string) {
    // First, unset all reference flags for this user
    await db
      .update(resumeFiles)
      .set({ isReference: false, updatedAt: new Date() })
      .where(eq(resumeFiles.userId, userId));

    // Then set the specified resume as reference
    await db
      .update(resumeFiles)
      .set({ isReference: true, updatedAt: new Date() })
      .where(eq(resumeFiles.id, resumeId));

    return await this.getResumeById(userId, resumeId);
  },

  async getPrimaryResume(userId: string) {
    const result = await db
      .select()
      .from(resumeFiles)
      .where(and(eq(resumeFiles.userId, userId), eq(resumeFiles.isPrimary, true)))
      .limit(1);

    return result.length > 0 ? result[0] : null;
  },

  async getReferenceResume(userId: string) {
    const result = await db
      .select()
      .from(resumeFiles)
      .where(and(eq(resumeFiles.userId, userId), eq(resumeFiles.isReference, true)))
      .limit(1);

    return result.length > 0 ? result[0] : null;
  },
};
