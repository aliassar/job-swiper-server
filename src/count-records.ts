import 'dotenv/config';
import postgres from 'postgres';

async function countRecords() {
    if (!process.env.DATABASE_URL) {
        console.error('DATABASE_URL is missing!');
        process.exit(1);
    }

    const sql = postgres(process.env.DATABASE_URL);

    try {
        const jobs = await sql`SELECT COUNT(*) as count FROM jobs`;
        const applications = await sql`SELECT COUNT(*) as count FROM applications`;

        console.log('📊 Database Stats:');
        console.log(`   Jobs: ${jobs[0].count}`);
        console.log(`   Applications: ${applications[0].count}`);
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await sql.end();
    }
}

countRecords();
