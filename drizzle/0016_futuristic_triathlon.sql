PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_goal_accounts` (
	`goal_id` text NOT NULL,
	`account_id` text NOT NULL,
	PRIMARY KEY(`goal_id`, `account_id`),
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
INSERT INTO `__new_goal_accounts`("goal_id", "account_id") SELECT "goal_id", "account_id" FROM `goal_accounts`;--> statement-breakpoint
DROP TABLE `goal_accounts`;--> statement-breakpoint
ALTER TABLE `__new_goal_accounts` RENAME TO `goal_accounts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;