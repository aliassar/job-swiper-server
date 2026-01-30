import 'dotenv/config';
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!);

async function run() {
    console.log('Creating idempotency_keys table...');

    await sql`
    CREATE TABLE IF NOT EXISTS "idempotency_keys" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "key" text NOT NULL,
      "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "response" jsonb NOT NULL,
      "status_code" integer NOT NULL,
      "expires_at" timestamp NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL
    )
  `;

    await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "idempotency_keys_user_id_key_unique" 
    ON "idempotency_keys" ("user_id", "key")
  `;

    await sql`
    CREATE INDEX IF NOT EXISTS "idempotency_keys_expires_at_idx" 
    ON "idempotency_keys" ("expires_at")
  `;

    console.log('✅ idempotency_keys table created successfully!');
    await sql.end();
}

run().catch((err) => {
    console.error('Error:', err);
    process.exit(1);
});
