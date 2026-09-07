CREATE TABLE `investment_values` (
	`account_id` text PRIMARY KEY NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`as_of` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "investment_values_amount_not_negative" CHECK("investment_values"."amount" >= 0),
	CONSTRAINT "investment_values_as_of_iso" CHECK("investment_values"."as_of" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);
