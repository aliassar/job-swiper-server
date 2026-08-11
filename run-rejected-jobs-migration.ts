/**
 * Applies 0016_add_rejected_jobs_log.sql: creates the rejected_jobs table and
 * rewrites the three BEFORE INSERT triggers on `jobs` to record why they drop
 * a row before dropping it.
 *
 * Run with: npx tsx run-rejected-jobs-migration.ts
 */

import 'dotenv/config';
import postgres from 'postgres';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
    if (!process.env.DATABASE_URL) {
        console.error('DATABASE_URL is missing!');
        process.exit(1);
    }

    const sql = postgres(process.env.DATABASE_URL);
    const migrationPath = path.join(__dirname, 'src/db/migrations/0016_add_rejected_jobs_log.sql');
    const migrationSql = fs.readFileSync(migrationPath, 'utf-8');

    try {
        await sql.unsafe(migrationSql);
        console.log('✅ 0016_add_rejected_jobs_log.sql applied successfully!');
        console.log('   Filtered jobs now land in the rejected_jobs table with a reason.');
    } catch (error) {
        console.error('Error applying migration:', error);
        process.exitCode = 1;
    } finally {
        await sql.end();
    }
}

runMigration();
