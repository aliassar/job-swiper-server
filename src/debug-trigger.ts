/**
 * Debug script to check if PostgreSQL functions exist and work correctly
 * 
 * Run with: npx tsx src/debug-trigger.ts
 */

import 'dotenv/config';
import { db } from './lib/db';
import { sql } from 'drizzle-orm';

async function main() {
    console.log('='.repeat(60));
    console.log('Debugging PostgreSQL Job Deduplication Functions');
    console.log('='.repeat(60));
    console.log('');

    // Check if functions exist
    console.log('1. Checking if functions exist...');
    try {
        const funcs = await db.execute(sql`
            SELECT proname FROM pg_proc 
            WHERE proname IN ('normalize_job_text', 'extract_job_words', 'are_job_words_alike', 'are_texts_alike', 'prevent_duplicate_jobs')
        `);
        console.log('   Found functions:', funcs.rows.map((r: any) => r.proname).join(', ') || 'NONE');
    } catch (e) {
        console.log('   Error checking functions:', e);
    }

    // Check if trigger exists
    console.log('\n2. Checking if trigger exists...');
    try {
        const triggers = await db.execute(sql`
            SELECT trigger_name, event_manipulation, action_timing
            FROM information_schema.triggers 
            WHERE event_object_table = 'jobs'
        `);
        console.log('   Triggers on jobs table:', triggers.rows.length > 0 ? JSON.stringify(triggers.rows) : 'NONE');
    } catch (e) {
        console.log('   Error checking triggers:', e);
    }

    // Test normalize_job_text function
    console.log('\n3. Testing normalize_job_text function...');
    try {
        const result = await db.execute(sql`SELECT normalize_job_text('Google Inc.') as normalized`);
        console.log('   normalize_job_text("Google Inc.") =', (result.rows[0] as any)?.normalized);
    } catch (e) {
        console.log('   Error:', e);
    }

    // Test extract_job_words function
    console.log('\n4. Testing extract_job_words function...');
    try {
        const result = await db.execute(sql`SELECT extract_job_words('Google Inc.') as words`);
        console.log('   extract_job_words("Google Inc.") =', (result.rows[0] as any)?.words);
    } catch (e) {
        console.log('   Error:', e);
    }

    // Test are_texts_alike function
    console.log('\n5. Testing are_texts_alike function...');
    try {
        const tests = [
            ['Google', 'Google Inc.'],
            ['Meta', 'Metadata Inc'],
            ['Software Engineer', 'software engineer'],
        ];

        for (const [t1, t2] of tests) {
            const result = await db.execute(sql`SELECT are_texts_alike(${t1}, ${t2}) as alike`);
            console.log(`   are_texts_alike("${t1}", "${t2}") = ${(result.rows[0] as any)?.alike}`);
        }
    } catch (e) {
        console.log('   Error:', e);
    }

    console.log('\nDone!');
    process.exit(0);
}

main().catch(console.error);
