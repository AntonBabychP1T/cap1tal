CREATE TABLE `alerts` (
	`kind` text PRIMARY KEY NOT NULL,
	`raised_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `daily_reminder` (
	`id` text PRIMARY KEY NOT NULL,
	`enabled` integer NOT NULL,
	`hour` integer NOT NULL,
	`minute` integer NOT NULL,
	CONSTRAINT "daily_reminder_single_row" CHECK("daily_reminder"."id" = 'reminder'),
	CONSTRAINT "daily_reminder_hour_of_day" CHECK("daily_reminder"."hour" BETWEEN 0 AND 23),
	CONSTRAINT "daily_reminder_minute_of_hour" CHECK("daily_reminder"."minute" BETWEEN 0 AND 59)
);
