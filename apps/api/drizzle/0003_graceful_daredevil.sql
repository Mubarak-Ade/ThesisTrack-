-- 0003 — schema deltas (spec §8) plus the pre-existing drift repair (§8.8).
--
-- Hand-edited: drizzle-kit generated the body of this file from src/schema, but
-- it cannot express (a) data backfills, (b) the two §8.8 defects, because both
-- live in the gap between the SQL files and the snapshot JSON. pnpm db:generate
-- compares schema to snapshot and is structurally blind to this file.
--
-- Verified: PostgreSQL 14.24.
--
-- READ BEFORE EDITING. drizzle-orm splits this file on the statement-breakpoint
-- marker (the two-dash, greater-than, "statement-breakpoint" sequence) and NOT
-- on semicolons — which is why the DO block below travels as one statement.
-- That marker must never appear anywhere in this file, COMMENTS INCLUDED: an
-- occurrence inside a comment makes drizzle split mid-comment and the run dies
-- with `syntax error at or near ""`. Earlier drafts of this header quoted the
-- marker verbatim and broke `pnpm db:migrate` for exactly that reason.
--
-- ──────────────────────────────────────────────────────────────────────────
-- §8.8 repair 1 — password_hash must be nullable.
-- 0000 created it NOT NULL and no later migration dropped it, while
-- src/schema has always declared it nullable: provisionUser inserts
-- password_hash NULL for INVITED users, so a migrated database rejects them.
-- DROP NOT NULL is idempotent — a db:push-ed database is already nullable.
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
-- ──────────────────────────────────────────────────────────────────────────
-- §8.8 repair 2 — account_tokens (and its enum) are absent from every
-- migration: 0000 creates 7 enums, not 8, and no file creates the table.
-- Both exist in src/schema and in any db:push-ed database, so every statement
-- here is guarded — PostgreSQL has no CREATE TYPE IF NOT EXISTS, hence the DO
-- block with duplicate_object swallowed.
-- ──────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "public"."account_token_type" AS ENUM('activation', 'password_reset');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "account_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "public"."account_token_type" NOT NULL,
	"token_hash" varchar(255) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_tokens_token_hash_unique" UNIQUE ("token_hash"),
	CONSTRAINT "account_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_account_tokens_user_id" ON "account_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_account_tokens_expires_at" ON "account_tokens" USING btree ("expires_at");--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'proposal';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'deadline';--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(255) NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" varchar(255) NOT NULL,
	"request_hash" varchar(64) NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "milestone_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposal_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"proposal_version" integer NOT NULL,
	"storage_key" text NOT NULL,
	"original_filename" varchar(255) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"size_bytes" integer NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "idx_supervisor_assignments_active_unique";--> statement-breakpoint
DROP INDEX "idx_proposals_project_id";--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "description" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "proposals" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "proposals" ALTER COLUMN "abstract" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ALTER COLUMN "submission_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "submission_versions" ALTER COLUMN "storage_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "supervisor_assignments" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
-- proposals.student_id: add nullable → backfill → enforce. The generated
-- statement added it as NOT NULL, which fails the moment any proposal exists.
ALTER TABLE "proposals" ADD COLUMN "student_id" uuid;--> statement-breakpoint
UPDATE "proposals" p SET "student_id" = pr."student_id"
  FROM "projects" pr
  WHERE p."project_id" = pr."id" AND p."student_id" IS NULL;--> statement-breakpoint
ALTER TABLE "proposals" ALTER COLUMN "student_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "body" text;--> statement-breakpoint
ALTER TABLE "reviews" ADD COLUMN "proposal_id" uuid;--> statement-breakpoint
ALTER TABLE "submission_versions" ADD COLUMN "body" text;--> statement-breakpoint
-- supervisor_assignments.student_id: same pattern. Every pre-existing row has
-- a project_id (it was NOT NULL, and projects cascade-delete their assignments),
-- so the backfill cannot leave a NULL behind. This is the statement that would
-- have aborted on the live database's 12 rows if added as NOT NULL directly.
ALTER TABLE "supervisor_assignments" ADD COLUMN "student_id" uuid;--> statement-breakpoint
UPDATE "supervisor_assignments" sa SET "student_id" = p."student_id"
  FROM "projects" p
  WHERE sa."project_id" = p."id" AND sa."student_id" IS NULL;--> statement-breakpoint
ALTER TABLE "supervisor_assignments" ALTER COLUMN "student_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestone_templates" ADD CONSTRAINT "milestone_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_attachments" ADD CONSTRAINT "proposal_attachments_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_attachments" ADD CONSTRAINT "proposal_attachments_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_idempotency_keys_unique" ON "idempotency_keys" USING btree ("key","user_id","endpoint");--> statement-breakpoint
CREATE INDEX "idx_idempotency_keys_expires_at" ON "idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_proposal_attachments_proposal" ON "proposal_attachments" USING btree ("proposal_id","proposal_version");--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supervisor_assignments" ADD CONSTRAINT "supervisor_assignments_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_projects_active_unique" ON "projects" USING btree ("student_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "idx_proposals_student_id" ON "proposals" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_proposals_in_flight" ON "proposals" USING btree ("student_id") WHERE status IN ('draft','submitted','under_review','revision_required');--> statement-breakpoint
CREATE INDEX "idx_reviews_proposal_id" ON "reviews" USING btree ("proposal_id");--> statement-breakpoint
CREATE INDEX "idx_supervisor_assignments_student_id" ON "supervisor_assignments" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_supervisor_assignments_active_student" ON "supervisor_assignments" USING btree ("student_id") WHERE ended_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_supervisor_assignments_active_project" ON "supervisor_assignments" USING btree ("project_id") WHERE ended_at IS NULL AND project_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_proposals_project_id" ON "proposals" USING btree ("project_id") WHERE project_id IS NOT NULL;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_exactly_one_target" CHECK (num_nonnulls(proposal_id, submission_id) = 1);--> statement-breakpoint
ALTER TABLE "submission_versions" ADD CONSTRAINT "submission_versions_one_of" CHECK (num_nonnulls(body, storage_key) = 1);
