DROP INDEX "idx_supervisor_assignments_unique";--> statement-breakpoint
ALTER TABLE "supervisor_assignments" ADD COLUMN "assigned_by" uuid;--> statement-breakpoint
ALTER TABLE "supervisor_assignments" ADD CONSTRAINT "supervisor_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_supervisor_assignments_active_unique" ON "supervisor_assignments" USING btree ("project_id") WHERE ended_at IS NULL;