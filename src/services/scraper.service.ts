import { db } from '../lib/db.js';
import { syncRuns } from '../db/schema.js';
import { scraperClient } from '../lib/microservice-client.js';
import { desc, eq } from 'drizzle-orm';

export const scraperService = {
  async triggerJobSync(requestId?: string) {
    // Create sync run record
    const syncRun = await db
      .insert(syncRuns)
      .values({
        status: 'running',
        jobsScraped: 0,
        jobsAdded: 0,
        errors: [],
      })
      .returning();

    try {
      // Call scraper service
      const response = await scraperClient.request<{
        jobsScraped: number;
        jobsAdded: number;
      }>('/scrape', {
        method: 'POST',
        requestId,
      });

      // Update sync run with results
      await db
        .update(syncRuns)
        .set({
          status: 'completed',
          jobsScraped: response.jobsScraped,
          jobsAdded: response.jobsAdded,
          completedAt: new Date(),
        })
        .where(eq(syncRuns.id, syncRun[0].id));

      return {
        ...syncRun[0],
        ...response,
        status: 'completed',
      };
    } catch (error) {
      // Update sync run with error
      await db
        .update(syncRuns)
        .set({
          status: 'failed',
          errors: [{ message: error instanceof Error ? error.message : 'Unknown error' }],
          completedAt: new Date(),
        })
        .where(eq(syncRuns.id, syncRun[0].id));

      throw error;
    }
  },

  async getLastSyncStatus() {
    const result = await db
      .select()
      .from(syncRuns)
      .orderBy(desc(syncRuns.startedAt))
      .limit(1);

    return result.length > 0 ? result[0] : null;
  },
};
