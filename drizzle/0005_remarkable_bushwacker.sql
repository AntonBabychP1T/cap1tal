CREATE TABLE `haptics_preference` (
	`id` text PRIMARY KEY NOT NULL,
	`enabled` integer NOT NULL,
	CONSTRAINT "haptics_preference_single_row" CHECK("haptics_preference"."id" = 'haptics')
);
