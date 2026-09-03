CREATE TABLE `goal_accounts` (
	`goal_id` text NOT NULL,
	`account_id` text NOT NULL,
	PRIMARY KEY(`goal_id`, `account_id`),
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
-- Data, hand-added: every stored ціль names exactly one рахунок, and this is the only moment that
-- pairing still exists — the rebuild of `goals` below drops the account_id column with the table.
-- goal_accounts carries no foreign key to goals in this migration precisely so that it may already
-- hold rows while `goals` is dropped (foreign keys are on: the generated PRAGMA foreign_keys=OFF is
-- a no-op inside the migrator's own BEGIN, and DROP TABLE with a live reference would either fail
-- or cascade away the very rows just copied). The next migration lands that foreign key.
INSERT INTO `goal_accounts` (`goal_id`, `account_id`) SELECT `id`, `account_id` FROM `goals`;
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_goals` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`deadline` text,
	CONSTRAINT "goals_amount_positive" CHECK("__new_goals"."amount" > 0),
	CONSTRAINT "goals_name_not_blank" CHECK(length(trim("__new_goals"."name")) > 0),
	CONSTRAINT "goals_deadline_iso" CHECK("__new_goals"."deadline" IS NULL OR "__new_goals"."deadline" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);
--> statement-breakpoint
INSERT INTO `__new_goals`("id", "name", "amount", "currency", "deadline") SELECT "id", "name", "amount", "currency", "deadline" FROM `goals`;--> statement-breakpoint
DROP TABLE `goals`;--> statement-breakpoint
ALTER TABLE `__new_goals` RENAME TO `goals`;--> statement-breakpoint
PRAGMA foreign_keys=ON;