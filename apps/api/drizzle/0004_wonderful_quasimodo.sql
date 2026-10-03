CREATE TYPE "public"."project_stage_status" AS ENUM('pending', 'active', 'completed');--> statement-breakpoint
CREATE TABLE "project_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"workflow_stage_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"status" "project_stage_status" DEFAULT 'pending' NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"due_offset_days" integer,
	"deliverable" varchar(255),
	"responsible_role" "user_role",
	"requires_submission" boolean DEFAULT false NOT NULL,
	"requires_review" boolean DEFAULT false NOT NULL,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone,
	"started_by" uuid,
	"completed_at" timestamp with time zone,
	"completed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"due_offset_days" integer,
	"deliverable" varchar(255),
	"responsible_role" "user_role",
	"requires_submission" boolean DEFAULT false NOT NULL,
	"requires_review" boolean DEFAULT false NOT NULL,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"program" varchar(255),
	"academic_session" varchar(32),
	"description" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "workflow_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "program" varchar(255);--> statement-breakpoint
ALTER TABLE "project_stages" ADD CONSTRAINT "project_stages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_stages" ADD CONSTRAINT "project_stages_workflow_stage_id_workflow_stages_id_fk" FOREIGN KEY ("workflow_stage_id") REFERENCES "public"."workflow_stages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_stages" ADD CONSTRAINT "project_stages_started_by_users_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_stages" ADD CONSTRAINT "project_stages_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_stages" ADD CONSTRAINT "workflow_stages_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_stages_project_position_unique" ON "project_stages" USING btree ("project_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "project_stages_one_active" ON "project_stages" USING btree ("project_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_stages_workflow_position_unique" ON "workflow_stages" USING btree ("workflow_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "workflows_one_active_per_program" ON "workflows" USING btree (lower("program")) WHERE archived_at is null and program is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "workflows_one_default" ON "workflows" USING btree ((true)) WHERE archived_at is null and is_default;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE restrict ON UPDATE no action;