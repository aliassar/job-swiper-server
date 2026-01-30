import 'dotenv/config';
import postgres from 'postgres';

async function rerollRejectedJobs() {
    if (!process.env.DATABASE_URL) {
        console.error('DATABASE_URL is missing!');
        process.exit(1);
    }

    const sql = postgres(process.env.DATABASE_URL);

    try {
        const result = await sql`DELETE FROM user_job_status WHERE status = 'rejected' RETURNING id`;
        console.log(`✅ Deleted ${result.length} rejected jobs - they will now appear in your swipe queue again`);
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await sql.end();
    }
}

rerollRejectedJobs();
