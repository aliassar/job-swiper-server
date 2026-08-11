import { db } from '../lib/db.js';
import { jobs, rejectedJobs } from '../db/schema.js';

// Type for job data that can be ingested
export interface JobIngestionData {
    externalId?: string | null;
    company: string;
    position: string;
    location?: string | null;
    salary?: string | null;
    salaryMin?: number | null;
    salaryMax?: number | null;
    requiredSkills?: string[];
    optionalSkills?: string[];
    description?: string | null;
    shortDescription?: string | null;
    requirements?: string | null;
    benefits?: string | null;
    jobType?: string | null;
    experienceLevel?: string | null;
    jobUrl?: string | null;
    postedDate?: Date | null;
    logoUrl?: string | null;
    srcName?: string | null;
    applyLink?: string | null;
    germanRequirement?: string | null;
    yearsOfExperience?: string | null;
    sourceId?: string | null;
}

export interface IngestionResult {
    inserted: number;
    rejected: number;
    total: number;
    insertedJobs: { id: string; externalId: string | null; company: string; position: string }[];
}

/**
 * Ingest multiple jobs into the database.
 *
 * Three BEFORE INSERT triggers on `jobs` can drop a row without raising:
 * prevent_duplicate_jobs (same externalId + alike company/position),
 * reject_unknown_jobs (company and position both "Unknown"), and
 * filter_unwanted_jobs (blocked title keywords). Each one records why in the
 * `rejected_jobs` table before dropping the row — see migration 0016 — so a
 * dropped job shows up as an empty `returning()` here, already explained.
 *
 * Jobs without externalId skip the duplicate check (nothing to compare on).
 */
export async function ingestJobs(jobsData: JobIngestionData[]): Promise<IngestionResult> {
    const result: IngestionResult = {
        inserted: 0,
        rejected: 0,
        total: jobsData.length,
        insertedJobs: [],
    };

    if (jobsData.length === 0) {
        return result;
    }

    const insertValues = jobsData.map(job => ({
        externalId: job.externalId || null,
        company: job.company,
        position: job.position,
        location: job.location || null,
        salary: job.salary || null,
        salaryMin: job.salaryMin || null,
        salaryMax: job.salaryMax || null,
        requiredSkills: job.requiredSkills || [],
        optionalSkills: job.optionalSkills || [],
        description: job.description || null,
        shortDescription: job.shortDescription || null,
        requirements: job.requirements || null,
        benefits: job.benefits || null,
        jobType: job.jobType || null,
        experienceLevel: job.experienceLevel || null,
        jobUrl: job.jobUrl || null,
        postedDate: job.postedDate || null,
        logoUrl: job.logoUrl || null,
        srcName: job.srcName || null,
        applyLink: job.applyLink || null,
        germanRequirement: job.germanRequirement || null,
        yearsOfExperience: job.yearsOfExperience || null,
        sourceId: job.sourceId || null,
    }));

    // Insert jobs - duplicates are silently skipped by the PostgreSQL trigger
    // We need to insert one by one to get accurate count of actually inserted rows
    for (const jobValue of insertValues) {
        try {
            const inserted = await db
                .insert(jobs)
                .values(jobValue)
                .returning({
                    id: jobs.id,
                    externalId: jobs.externalId,
                    company: jobs.company,
                    position: jobs.position,
                });

            // If a trigger dropped the row, inserted is empty. The trigger has
            // already written the reason to rejected_jobs.
            if (inserted.length > 0) {
                result.inserted++;
                result.insertedJobs.push(inserted[0]);
            } else {
                result.rejected++;
            }
        } catch (error) {
            // A raised error aborts the transaction, taking any trigger-written
            // rejected_jobs row with it, so record the failure from here instead.
            result.rejected++;
            console.error(`[Job Ingestion] Error inserting job:`, error);
            await recordInsertError(jobValue, error);
        }
    }

    return result;
}

/**
 * Record an ingestion failure that no trigger could log for us. Never throws:
 * losing the audit row must not abort the rest of the batch.
 */
async function recordInsertError(jobValue: typeof jobs.$inferInsert, error: unknown): Promise<void> {
    try {
        await db.insert(rejectedJobs).values({
            externalId: jobValue.externalId ?? null,
            company: jobValue.company,
            position: jobValue.position,
            location: jobValue.location ?? null,
            jobUrl: jobValue.jobUrl ?? null,
            applyLink: jobValue.applyLink ?? null,
            srcName: jobValue.srcName ?? null,
            postedDate: jobValue.postedDate ?? null,
            reason: 'insert_error',
            reasonDetail: error instanceof Error ? error.message : String(error),
            payload: jobValue,
        });
    } catch (logError) {
        console.error('[Job Ingestion] Failed to record rejected job:', logError);
    }
}

export const jobIngestionService = {
    ingestJobs,
};
