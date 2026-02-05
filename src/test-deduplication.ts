/**
 * Test script for PostgreSQL job deduplication trigger
 * 
 * Run with: npx tsx src/test-deduplication.ts
 */

import 'dotenv/config';
import { db } from './lib/db.js';
import { jobs } from './db/schema.js';
import { inArray } from 'drizzle-orm';

const TEST_EXTERNAL_ID_PREFIX = 'dedup-test-';

interface TestCase {
    name: string;
    jobs: { company: string; position: string; externalId: string }[];
    expectedCount: number;
    description: string;
    checkExternalIds?: boolean; // Check if externalIds were modified
}

const testCases: TestCase[] = [
    {
        name: 'Exact duplicate',
        jobs: [
            { company: 'Google', position: 'Software Engineer', externalId: `${TEST_EXTERNAL_ID_PREFIX}1` },
            { company: 'Google', position: 'Software Engineer', externalId: `${TEST_EXTERNAL_ID_PREFIX}1` },
        ],
        expectedCount: 1,
        description: 'Identical company, position, and externalId - should insert only once',
    },
    {
        name: 'Same externalId, similar company (Inc suffix)',
        jobs: [
            { company: 'Google', position: 'Software Engineer', externalId: `${TEST_EXTERNAL_ID_PREFIX}2` },
            { company: 'Google Inc.', position: 'Software Engineer', externalId: `${TEST_EXTERNAL_ID_PREFIX}2` },
        ],
        expectedCount: 1,
        description: 'Company differs only by Inc suffix - should be treated as duplicate',
    },
    {
        name: 'Same externalId, different position (gets new externalId)',
        jobs: [
            { company: 'Google', position: 'Software Engineer', externalId: `${TEST_EXTERNAL_ID_PREFIX}3` },
            { company: 'Google', position: 'Product Manager', externalId: `${TEST_EXTERNAL_ID_PREFIX}3` },
        ],
        expectedCount: 2,
        description: 'Same company, different position - should insert BOTH with modified externalId',
        checkExternalIds: true,
    },
    {
        name: 'Same externalId, different company (gets new externalId)',
        jobs: [
            { company: 'Google', position: 'Software Engineer', externalId: `${TEST_EXTERNAL_ID_PREFIX}4` },
            { company: 'Meta', position: 'Software Engineer', externalId: `${TEST_EXTERNAL_ID_PREFIX}4` },
        ],
        expectedCount: 2,
        description: 'Different company, same position - should insert BOTH with modified externalId',
        checkExternalIds: true,
    },
    {
        name: 'Different externalId, same company/position',
        jobs: [
            { company: 'Amazon', position: 'DevOps Engineer', externalId: `${TEST_EXTERNAL_ID_PREFIX}5a` },
            { company: 'Amazon', position: 'DevOps Engineer', externalId: `${TEST_EXTERNAL_ID_PREFIX}5b` },
        ],
        expectedCount: 2,
        description: 'Different externalId - should insert BOTH (trigger only checks within same externalId)',
    },
    {
        name: 'Meta vs Metadata (false positive check)',
        jobs: [
            { company: 'Meta', position: 'Engineer', externalId: `${TEST_EXTERNAL_ID_PREFIX}6` },
            { company: 'Metadata Inc', position: 'Engineer', externalId: `${TEST_EXTERNAL_ID_PREFIX}6` },
        ],
        expectedCount: 2,
        description: 'Meta and Metadata are DIFFERENT companies - should insert BOTH',
        checkExternalIds: true,
    },
    {
        name: 'Case insensitive check',
        jobs: [
            { company: 'GOOGLE', position: 'SOFTWARE ENGINEER', externalId: `${TEST_EXTERNAL_ID_PREFIX}7` },
            { company: 'google', position: 'software engineer', externalId: `${TEST_EXTERNAL_ID_PREFIX}7` },
        ],
        expectedCount: 1,
        description: 'Same text different case - should be treated as duplicate',
    },
    {
        name: 'Position with Senior prefix (NOT a duplicate now)',
        jobs: [
            { company: 'Netflix', position: 'Frontend Developer', externalId: `${TEST_EXTERNAL_ID_PREFIX}8` },
            { company: 'Netflix', position: 'Senior Frontend Developer', externalId: `${TEST_EXTERNAL_ID_PREFIX}8` },
        ],
        expectedCount: 2,
        description: 'Position with Senior prefix - should be treated as DIFFERENT jobs',
        checkExternalIds: true,
    },
];

async function cleanup() {
    // Delete all test jobs - need to match both original and modified externalIds
    const testExternalIds = testCases.flatMap(tc => tc.jobs.map(j => j.externalId));
    // Also include potential modified IDs with -1, -2 suffixes
    const allPossibleIds = testExternalIds.flatMap(id => [id, `${id}-1`, `${id}-2`, `${id}-3`]);
    await db.delete(jobs).where(inArray(jobs.externalId, allPossibleIds));
}

async function runTest(testCase: TestCase): Promise<{ passed: boolean; actualCount: number; details?: string }> {
    const originalExternalIds = [...new Set(testCase.jobs.map(j => j.externalId))];

    // Clean up any existing test data for this test case
    const allPossibleIds = originalExternalIds.flatMap(id => [id, `${id}-1`, `${id}-2`, `${id}-3`]);
    await db.delete(jobs).where(inArray(jobs.externalId, allPossibleIds));

    // Insert jobs one by one
    for (const job of testCase.jobs) {
        try {
            await db.insert(jobs).values({
                company: job.company,
                position: job.position,
                externalId: job.externalId,
            });
        } catch (error) {
            console.error(`  Error inserting job:`, error);
        }
    }

    // Count actual inserted jobs (check all possible IDs including modified ones)
    const result = await db
        .select({ id: jobs.id, externalId: jobs.externalId, company: jobs.company, position: jobs.position })
        .from(jobs)
        .where(inArray(jobs.externalId, allPossibleIds));

    const actualCount = result.length;
    const passed = actualCount === testCase.expectedCount;

    let details: string | undefined;
    if (testCase.checkExternalIds && passed && result.length > 1) {
        const externalIds = result.map(r => r.externalId);
        const uniqueIds = new Set(externalIds);
        if (uniqueIds.size === result.length) {
            details = `External IDs are unique: ${externalIds.join(', ')}`;
        } else {
            details = `WARNING: External IDs not unique: ${externalIds.join(', ')}`;
        }
    }

    return { passed, actualCount, details };
}

async function main() {
    console.log('='.repeat(60));
    console.log('Testing PostgreSQL Job Deduplication Trigger');
    console.log('='.repeat(60));
    console.log('');

    let passedCount = 0;
    let failedCount = 0;

    for (const testCase of testCases) {
        console.log(`Test: ${testCase.name}`);
        console.log(`  ${testCase.description}`);

        const { passed, actualCount, details } = await runTest(testCase);

        if (passed) {
            console.log(`  ✅ PASSED (expected ${testCase.expectedCount}, got ${actualCount})`);
            if (details) console.log(`  ${details}`);
            passedCount++;
        } else {
            console.log(`  ❌ FAILED (expected ${testCase.expectedCount}, got ${actualCount})`);
            failedCount++;
        }
        console.log('');
    }

    console.log('='.repeat(60));
    console.log(`Results: ${passedCount} passed, ${failedCount} failed`);
    console.log('='.repeat(60));

    // Cleanup
    console.log('\nCleaning up test data...');
    await cleanup();
    console.log('Done!');

    process.exit(failedCount > 0 ? 1 : 0);
}

main().catch(console.error);
