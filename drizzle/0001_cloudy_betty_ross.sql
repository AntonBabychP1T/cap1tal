CREATE TABLE `counterpart_income_awaits` (
	`transaction_id` text PRIMARY KEY NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant` text,
	`mcc` integer,
	`category_id` text,
	`to_account_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`to_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "rules_criterion_present" CHECK("__new_rules"."merchant" IS NOT NULL OR "__new_rules"."mcc" IS NOT NULL),
	CONSTRAINT "rules_merchant_not_blank" CHECK("__new_rules"."merchant" IS NULL OR length(trim("__new_rules"."merchant")) > 0),
	CONSTRAINT "rules_target_exactly_one" CHECK(("__new_rules"."category_id" IS NULL) <> ("__new_rules"."to_account_id" IS NULL))
);
--> statement-breakpoint
INSERT INTO `__new_rules`("id", "merchant", "mcc", "category_id", "to_account_id", "created_at") SELECT "id", "merchant", "mcc", "category_id", NULL, "created_at" FROM `rules`;--> statement-breakpoint
DROP TABLE `rules`;--> statement-breakpoint
ALTER TABLE `__new_rules` RENAME TO `rules`;--> statement-breakpoint
PRAGMA foreign_keys=ON;