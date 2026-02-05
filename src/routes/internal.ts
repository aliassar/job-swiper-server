import { Hono } from 'hono';
import { db } from '../lib/db.js';
import { userProfiles, resumeFiles, userSettings, jobs } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { formatResponse } from '../lib/utils.js';

const internal = new Hono();

/**
 * Middleware to verify internal API secret
 * Protects endpoints meant only for n8n/microservices
 */
internal.use('*', async (c, next) => {
    const authHeader = c.req.header('Authorization');
    const internalSecret = process.env.INTERNAL_API_SECRET;

    if (!internalSecret) {
        console.error('INTERNAL_API_SECRET not configured');
        return c.json({ success: false, error: 'Internal API not configured' }, 500);
    }

    if (authHeader !== `Bearer ${internalSecret}`) {
        return c.json({ success: false, error: 'Unauthorized' }, 401);
    }

    return next();
});

/**
 * GET /api/internal/user-profile/:userId
 * Get user profile data for document generation
 */
internal.get('/user-profile/:userId', async (c) => {
    const userId = c.req.param('userId');
    const requestId = crypto.randomUUID();

    const profile = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, userId))
        .limit(1);

    const settings = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, userId))
        .limit(1);

    let baseResume = null;
    if (settings.length > 0 && settings[0].baseResumeId) {
        const resume = await db
            .select()
            .from(resumeFiles)
            .where(eq(resumeFiles.id, settings[0].baseResumeId))
            .limit(1);
        baseResume = resume[0] || null;
    }

    return c.json(formatResponse(true, {
        ...profile[0],
        baseResume,
        baseCoverLetterUrl: settings[0]?.baseCoverLetterUrl,
    }, null, requestId));
});

/**
 * GET /api/internal/job/:jobId
 * Get job details for document generation
 */
internal.get('/job/:jobId', async (c) => {
    const jobId = c.req.param('jobId');
    const requestId = crypto.randomUUID();

    const job = await db
        .select()
        .from(jobs)
        .where(eq(jobs.id, jobId))
        .limit(1);

    if (job.length === 0) {
        return c.json(formatResponse(false, null, {
            code: 'NOT_FOUND',
            message: 'Job not found',
        }, requestId), 404);
    }

    return c.json(formatResponse(true, job[0], null, requestId));
});

/**
 * POST /api/internal/jobs/ingest
 * Bulk ingest jobs with deduplication handled by PostgreSQL trigger.
 * 
 * Duplicates are detected at the database level based on:
 * - Same externalId AND
 * - Similar company (word-boundary match) AND
 * - Similar position (word-boundary match)
 * 
 * Request body:
 * {
 *   "jobs": [
 *     {
 *       "externalId": "abc123",
 *       "company": "Google Inc.",
 *       "position": "Software Engineer",
 *       ... other optional fields
 *     }
 *   ]
 * }
 * 
 * Response:
 * {
 *   "inserted": 15,
 *   "total": 20,
 *   "insertedJobs": [...]
 * }
 */
internal.post('/jobs/ingest', async (c) => {
    const requestId = crypto.randomUUID();
    const { jobIngestionService } = await import('../services/job-ingestion.service.js');

    let body;
    try {
        body = await c.req.json();
    } catch (error) {
        return c.json(formatResponse(false, null, {
            code: 'INVALID_JSON',
            message: 'Invalid JSON in request body',
        }, requestId), 400);
    }

    if (!body.jobs || !Array.isArray(body.jobs)) {
        return c.json(formatResponse(false, null, {
            code: 'INVALID_PAYLOAD',
            message: 'Request body must contain a "jobs" array',
        }, requestId), 400);
    }

    // Validate each job has required fields
    for (let i = 0; i < body.jobs.length; i++) {
        const job = body.jobs[i];
        if (!job.company || typeof job.company !== 'string') {
            return c.json(formatResponse(false, null, {
                code: 'INVALID_JOB',
                message: `Job at index ${i} is missing required field "company"`,
            }, requestId), 400);
        }
        if (!job.position || typeof job.position !== 'string') {
            return c.json(formatResponse(false, null, {
                code: 'INVALID_JOB',
                message: `Job at index ${i} is missing required field "position"`,
            }, requestId), 400);
        }
    }

    // Transform snake_case keys from n8n to camelCase for ingestion service
    const transformedJobs = body.jobs.map((job: Record<string, unknown>) => ({
        externalId: job.externalId ?? job.external_id,
        company: job.company,
        position: job.position,
        location: job.location,
        salary: job.salary,
        salaryMin: job.salaryMin ?? job.salary_min,
        salaryMax: job.salaryMax ?? job.salary_max,
        requiredSkills: job.requiredSkills ?? job.required_skills,
        optionalSkills: job.optionalSkills ?? job.optional_skills,
        description: job.description,
        shortDescription: job.shortDescription ?? job.short_description,
        requirements: job.requirements,
        benefits: job.benefits,
        jobType: job.jobType ?? job.job_type,
        experienceLevel: job.experienceLevel ?? job.experience_level,
        jobUrl: job.jobUrl ?? job.job_url,
        postedDate: job.postedDate ?? job.posted_date,
        logoUrl: job.logoUrl ?? job.logo_url,
        srcName: job.src_name ?? job.srcName,
        applyLink: job.applyLink ?? job.apply_link,
        germanRequirement: job.germanRequirement ?? job.german_requirement,
        yearsOfExperience: job.yearsOfExperience ?? job.years_of_experience,
        sourceId: job.sourceId ?? job.source_id,
    }));

    try {
        const result = await jobIngestionService.ingestJobs(transformedJobs);

        console.log(`[Job Ingestion] Processed ${result.total} jobs: ${result.inserted} inserted`);

        return c.json(formatResponse(true, result, null, requestId));
    } catch (error) {
        console.error('[Job Ingestion] Error:', error);
        return c.json(formatResponse(false, null, {
            code: 'INGESTION_ERROR',
            message: error instanceof Error ? error.message : 'Failed to ingest jobs',
        }, requestId), 500);
    }
});

export default internal;
