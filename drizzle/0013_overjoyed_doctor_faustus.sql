CREATE TABLE `monobank_sync_attempt` (
	`id` text PRIMARY KEY NOT NULL,
	`attempted_at` integer NOT NULL,
	`outcome` text,
	CONSTRAINT "monobank_sync_attempt_single_row" CHECK("monobank_sync_attempt"."id" = 'attempt')
);
