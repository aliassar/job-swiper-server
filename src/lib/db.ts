import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../db/schema.js';

const client = postgres(process.env.DATABASE_URL!, { ssl: false, max: 10 });

export const db = drizzle(client, { schema });
