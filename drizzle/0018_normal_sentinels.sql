CREATE TABLE `monobank_request_pace` (
	`id` text PRIMARY KEY NOT NULL,
	`last_request_at` integer NOT NULL,
	CONSTRAINT "monobank_request_pace_single_row" CHECK("monobank_request_pace"."id" = 'pace')
);
--> statement-breakpoint
ALTER TABLE `monobank_links` ADD `last_attempted_at` integer;