CREATE TABLE `notification_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`currency` text NOT NULL,
	`date` text NOT NULL,
	`text` text NOT NULL,
	`kind` text NOT NULL,
	`amount` integer,
	`original_amount` integer,
	`original_currency` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "notification_drafts_kind_known" CHECK("notification_drafts"."kind" IN ('expense', 'income', 'raw')),
	CONSTRAINT "notification_drafts_date_iso" CHECK("notification_drafts"."date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "notification_drafts_original_paired" CHECK(("notification_drafts"."original_amount" IS NULL) = ("notification_drafts"."original_currency" IS NULL)),
	CONSTRAINT "notification_drafts_shape" CHECK(CASE "notification_drafts"."kind"
        WHEN 'raw' THEN "notification_drafts"."amount" IS NULL
        ELSE "notification_drafts"."amount" IS NOT NULL AND "notification_drafts"."original_amount" IS NULL
      END)
);
--> statement-breakpoint
CREATE TABLE `notification_fingerprints` (
	`fingerprint` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notification_watches` (
	`package_name` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict
);
