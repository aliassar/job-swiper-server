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
    const migrationPath = path.join(__dirname, 'src/db/migrations/0013_reject_unknown_jobs.sql');
    const migrationSql = fs.readFileSync(migrationPath, 'utf-8');

    try {
        await sql.unsafe(migrationSql);
        console.log('✅ Migration 0013_reject_unknown_jobs.sql applied successfully!');
    } catch (error) {
        console.error('Error applying migration:', error);
    } finally {
        await sql.end();
    }
}

runMigration();
