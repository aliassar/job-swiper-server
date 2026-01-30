/**
 * Script to apply the job deduplication functions and trigger directly
 * 
 * Run with: npx tsx src/apply-dedup-trigger.ts
 */

import 'dotenv/config';
import { db } from './lib/db';
import { sql } from 'drizzle-orm';

async function main() {
    console.log('Applying job deduplication trigger...');
    console.log('');

    // Create normalize_job_text function
    console.log('1. Creating normalize_job_text function...');
    await db.execute(sql`
        CREATE OR REPLACE FUNCTION normalize_job_text(input_text TEXT)
        RETURNS TEXT AS $$
        DECLARE
            result TEXT;
        BEGIN
            IF input_text IS NULL OR input_text = '' THEN
                RETURN '';
            END IF;
            
            result := input_text;
            result := LOWER(result);
            result := TRIM(result);
            result := REGEXP_REPLACE(result, '\s+', ' ', 'g');
            result := REGEXP_REPLACE(result, '\.(com|org|net|io|co|ai|dev|app|xyz|tech|info)\y', '', 'gi');
            result := REGEXP_REPLACE(result, '\s*(inc\.?|llc\.?|ltd\.?|corp\.?|corporation|company|co\.?|gmbh|ag|plc)\s*$', '', 'gi');
            result := TRIM(result);
            
            RETURN result;
        END;
        $$ LANGUAGE plpgsql IMMUTABLE
    `);
    console.log('   Done.');

    // Create are_texts_alike function - EXACT MATCH only (no subset matching)
    console.log('2. Creating are_texts_alike function (exact match only)...');
    await db.execute(sql`
        CREATE OR REPLACE FUNCTION are_texts_alike(text1 TEXT, text2 TEXT)
        RETURNS BOOLEAN AS $$
        BEGIN
            RETURN normalize_job_text(text1) = normalize_job_text(text2);
        END;
        $$ LANGUAGE plpgsql IMMUTABLE
    `);
    console.log('   Done.');

    // Create prevent_duplicate_jobs trigger function
    // Now: modifies external_id for different jobs with same original external_id
    console.log('3. Creating prevent_duplicate_jobs trigger function...');
    await db.execute(sql`
        CREATE OR REPLACE FUNCTION prevent_duplicate_jobs()
        RETURNS TRIGGER AS $$
        DECLARE
            existing_job RECORD;
            is_duplicate BOOLEAN := FALSE;
            suffix_counter INTEGER := 1;
            new_external_id TEXT;
        BEGIN
            IF NEW.external_id IS NULL OR NEW.external_id = '' THEN
                RETURN NEW;
            END IF;
            
            -- Check for exact duplicates (same externalId + similar company + similar position)
            FOR existing_job IN 
                SELECT company, position 
                FROM jobs 
                WHERE external_id = NEW.external_id
            LOOP
                IF are_texts_alike(NEW.company, existing_job.company) AND
                   are_texts_alike(NEW.position, existing_job.position) THEN
                    -- True duplicate - skip this insert
                    RETURN NULL;
                END IF;
            END LOOP;
            
            -- Not a duplicate, but same externalId exists with different job
            -- Generate a unique externalId by appending suffix
            IF EXISTS (SELECT 1 FROM jobs WHERE external_id = NEW.external_id) THEN
                new_external_id := NEW.external_id || '-' || suffix_counter;
                WHILE EXISTS (SELECT 1 FROM jobs WHERE external_id = new_external_id) LOOP
                    suffix_counter := suffix_counter + 1;
                    new_external_id := NEW.external_id || '-' || suffix_counter;
                END LOOP;
                NEW.external_id := new_external_id;
            END IF;
            
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
    `);
    console.log('   Done.');

    // Drop old helper functions that are no longer needed
    console.log('4. Cleaning up old helper functions...');
    await db.execute(sql`DROP FUNCTION IF EXISTS extract_job_words(TEXT)`);
    await db.execute(sql`DROP FUNCTION IF EXISTS are_job_words_alike(TEXT[], TEXT[])`);
    console.log('   Done.');

    // Create trigger
    console.log('5. Creating trigger on jobs table...');
    await db.execute(sql`DROP TRIGGER IF EXISTS prevent_duplicate_jobs_trigger ON jobs`);
    await db.execute(sql`
        CREATE TRIGGER prevent_duplicate_jobs_trigger
            BEFORE INSERT ON jobs
            FOR EACH ROW
            EXECUTE FUNCTION prevent_duplicate_jobs()
    `);
    console.log('   Done.');

    // Create index
    console.log('6. Creating index on external_id...');
    await db.execute(sql`CREATE INDEX IF NOT EXISTS jobs_external_id_idx ON jobs(external_id) WHERE external_id IS NOT NULL`);
    console.log('   Done.');

    console.log('');
    console.log('All functions and trigger applied successfully!');
    process.exit(0);
}

main().catch((err) => {
    console.error('Error:', err);
    process.exit(1);
});
