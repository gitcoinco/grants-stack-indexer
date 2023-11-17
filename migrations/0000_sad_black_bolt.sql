DO $$ BEGIN
 CREATE TYPE "status" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'IN_REVIEW');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "applications" (
	"chain_id" integer NOT NULL,
	"id" text,
	"round_id" varchar(42) NOT NULL,
	"project_id" text NOT NULL,
	"status" "status" NOT NULL,
	"status_snapshots" jsonb NOT NULL,
	"metadata_cid" text NOT NULL,
	"metadata" jsonb,
	"created_at_block" text NOT NULL,
	"status_updated_at_block" text NOT NULL,
	"total_unique_donors" integer NOT NULL,
	"total_donations" integer NOT NULL,
	"total_amount_donated_in_usd" real NOT NULL,
	CONSTRAINT applications_id_round_id_chain_id PRIMARY KEY("id","round_id","chain_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "donations" (
	"id" text PRIMARY KEY NOT NULL,
	"chain_id" integer NOT NULL,
	"round_id" varchar(42) NOT NULL,
	"application_id" text,
	"donor_address" varchar(42) NOT NULL,
	"token_address" varchar(42) NOT NULL,
	"recipient_address" varchar(42) NOT NULL,
	"project_id" text,
	"transaction_hash" varchar(66) NOT NULL,
	"block_number" text NOT NULL,
	"amount" text NOT NULL,
	"amount_usd" real NOT NULL,
	"amount_in_round_match_token" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "projects" (
	"chain_id" integer NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"project_number" integer NOT NULL,
	"registry_address" varchar(42) NOT NULL,
	"metadata_cid" text,
	"metadata" jsonb,
	"owner_address" varchar(42)[] NOT NULL,
	"created_at_block" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rounds" (
	"id" varchar(42) NOT NULL,
	"chain_id" integer NOT NULL,
	"match_amount" text NOT NULL,
	"match_token" varchar(42) NOT NULL,
	"match_token_amount_in_usd" real NOT NULL,
	"application_metadata_cid" text NOT NULL,
	"application_metadata" jsonb,
	"round_metadata_cid" text NOT NULL,
	"round_metadata" jsonb,
	"applications_start_time" timestamp,
	"applications_end_time" timestamp,
	"voting_start_time" timestamp,
	"voting_end_time" timestamp,
	"created_at_block" text NOT NULL,
	"updated_at_block" text NOT NULL,
	"total_unique_donors" integer NOT NULL,
	"total_votes_amount_usd" real NOT NULL,
	"total_votes_count" integer NOT NULL,
	CONSTRAINT rounds_id_chain_id PRIMARY KEY("id","chain_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "applications" ADD CONSTRAINT "applications_chain_id_round_id_rounds_chain_id_id_fk" FOREIGN KEY ("chain_id","round_id") REFERENCES "rounds"("chain_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "donations" ADD CONSTRAINT "donations_application_id_round_id_chain_id_applications_id_round_id_chain_id_fk" FOREIGN KEY ("application_id","round_id","chain_id") REFERENCES "applications"("id","round_id","chain_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
