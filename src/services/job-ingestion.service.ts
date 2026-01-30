import { db } from '../lib/db';
import { jobs } from '../db/schema';

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
    total: number;
    insertedJobs: { id: string; externalId: string | null; company: string; position: string }[];
}

/**
 * Ingest multiple jobs into the database.
 * 
 * Deduplication is now handled by a PostgreSQL trigger (prevent_duplicate_jobs).
 * The trigger silently skips duplicate jobs based on:
 * - Same externalId AND
 * - Similar company (word-boundary match) AND  
 * - Similar position (word-boundary match)
 * 
 * Jobs without externalId are always inserted (no duplicate check possible).
 */
export async function ingestJobs(jobsData: JobIngestionData[]): Promise<IngestionResult> {
    const result: IngestionResult = {
        inserted: 0,
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

            // If the trigger skipped the insert, inserted will be empty
            if (inserted.length > 0) {
                result.inserted++;
                result.insertedJobs.push(inserted[0]);
            }
        } catch (error) {
            // Log but don't fail the entire batch for single job errors
            console.error(`[Job Ingestion] Error inserting job:`, error);
        }
    }

    return result;
}

export const jobIngestionService = {
    ingestJobs,
};
