import 'dotenv/config';
import postgres from 'postgres';

async function skipUnknownJobs() {
    if (!process.env.DATABASE_URL) {
        console.error('DATABASE_URL is missing!');
        process.exit(1);
    }

    const sql = postgres(process.env.DATABASE_URL);

    try {
        // First, find all jobs with Unknown company AND position
        const unknownJobs = await sql`
            SELECT id, company, position 
            FROM jobs 
            WHERE LOWER(company) = 'unknown' AND LOWER(position) = 'unknown'
        `;

        console.log(`Found ${unknownJobs.length} jobs with Unknown company and title`);

        if (unknownJobs.length === 0) {
            console.log('No Unknown jobs to skip');
            return;
        }

        // Delete these jobs entirely (they're garbage data)
        const deleted = await sql`
            DELETE FROM jobs 
            WHERE LOWER(company) = 'unknown' AND LOWER(position) = 'unknown'
            RETURNING id
        `;

        console.log(`✅ Deleted ${deleted.length} jobs with Unknown company and title`);
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await sql.end();
    }
}

skipUnknownJobs();
