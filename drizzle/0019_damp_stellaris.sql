CREATE TABLE `drive_backup` (
	`id` text PRIMARY KEY NOT NULL,
	`account_label` text,
	`recovery_code_acknowledged_at` integer,
	`last_success_at` integer,
	`last_uploaded_checksum` text,
	`last_failure_kind` text,
	`last_failure_at` integer,
	CONSTRAINT "drive_backup_single_row" CHECK("drive_backup"."id" = 'drive')
);
