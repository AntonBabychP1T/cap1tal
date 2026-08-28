CREATE TABLE `category_limits` (
	`category_id` text PRIMARY KEY NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "category_limits_amount_positive" CHECK("category_limits"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`deadline` text NOT NULL,
	`account_id` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "goals_amount_positive" CHECK("goals"."amount" > 0),
	CONSTRAINT "goals_name_not_blank" CHECK(length(trim("goals"."name")) > 0),
	CONSTRAINT "goals_deadline_iso" CHECK("goals"."deadline" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);
