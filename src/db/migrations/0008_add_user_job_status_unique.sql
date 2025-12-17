CREATE UNIQUE INDEX IF NOT EXISTS "user_job_status_user_id_job_id_unique" ON "user_job_status" USING btree ("user_id","job_id");
