import 'dotenv/config';
import postgres from 'postgres';

async function clearAll() {
    if (!process.env.DATABASE_URL) {
        console.error('DATABASE_URL is missing!');
        process.exit(1);
    }

    const sql = postgres(process.env.DATABASE_URL);

    try {
        console.log('🗑️ Clearing all jobs and applications data...');

        // Clear in order due to foreign key constraints

        // 1. Workflow runs (references applications)
        const workflows = await sql`DELETE FROM workflow_runs RETURNING id`;
        console.log(`✅ Deleted ${workflows.length} workflow runs`);

        // 2. Applications (references jobs)
        const apps = await sql`DELETE FROM applications RETURNING id`;
        console.log(`✅ Deleted ${apps.length} applications`);

        // 3. User job status (references jobs)
        const statuses = await sql`DELETE FROM user_job_status RETURNING id`;
        console.log(`✅ Deleted ${statuses.length} user job statuses`);

        // 4. Reported jobs (references jobs)
        const reports = await sql`DELETE FROM reported_jobs RETURNING id`;
        console.log(`✅ Deleted ${reports.length} reported jobs`);

        // 5. Action history (references jobs)
        const history = await sql`DELETE FROM action_history RETURNING id`;
        console.log(`✅ Deleted ${history.length} action history records`);

        // 6. Jobs (main table)
        const jobs = await sql`DELETE FROM jobs RETURNING id`;
        console.log(`✅ Deleted ${jobs.length} jobs`);

        console.log('\n🎉 Done! All job and application records cleared.');
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await sql.end();
    }
}

clearAll();
