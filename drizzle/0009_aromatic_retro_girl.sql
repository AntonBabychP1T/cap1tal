CREATE TABLE `entry_defaults` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "entry_defaults_single_row" CHECK("entry_defaults"."id" = 'entry')
);
