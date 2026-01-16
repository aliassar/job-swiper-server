import 'dotenv/config';
import postgres from 'postgres';

async function clearAll() {
    if (!process.env.DATABASE_URL) {
        console.error('DATABASE_URL is missing!');
        process.exit(1);
    }

    const sql = postgres(process.env.DATABASE_URL);

    try {
        console.log('🗑️ Clearing all data...');

        // Delete applications first (due to foreign key constraint)
        const apps = await sql`DELETE FROM applications RETURNING id`;
        console.log(`✅ Deleted ${apps.length} applications`);

        // Delete jobs
        const jobs = await sql`DELETE FROM jobs RETURNING id`;
        console.log(`✅ Deleted ${jobs.length} jobs`);

        console.log('\n🎉 Done! All records cleared.');
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await sql.end();
    }
}

clearAll();
