CREATE TABLE `bug_report_screenshots` (
	`report_id` text NOT NULL,
	`name` text NOT NULL,
	`added_at` integer NOT NULL,
	PRIMARY KEY(`report_id`, `name`),
	FOREIGN KEY (`report_id`) REFERENCES `bug_reports`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `bug_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`route` text NOT NULL,
	`did` text NOT NULL,
	`happened` text,
	`expected` text,
	`prompting_json` text,
	`build_json` text NOT NULL,
	`device_json` text NOT NULL,
	`counts_json` text NOT NULL,
	`journal_json` text NOT NULL,
	`migrations_applied` integer NOT NULL,
	`handed_over_at` integer
);
--> statement-breakpoint
CREATE TABLE `journal` (
	`id` text PRIMARY KEY NOT NULL,
	`at` integer NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`detail` text
);
