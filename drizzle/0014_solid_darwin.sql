CREATE TABLE `bug_report_capture` (
	`id` text PRIMARY KEY NOT NULL,
	`gesture_enabled` integer NOT NULL,
	`handle_enabled` integer NOT NULL,
	CONSTRAINT "bug_report_capture_single_row" CHECK("bug_report_capture"."id" = 'capture')
);
--> statement-breakpoint
ALTER TABLE `bug_reports` ADD `origin` text;--> statement-breakpoint
ALTER TABLE `bug_reports` ADD `capture_failure` text;