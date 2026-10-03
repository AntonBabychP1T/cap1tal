CREATE TABLE `merchant_spellings` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant_id` text NOT NULL,
	`spelling` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "merchant_spellings_not_blank" CHECK(length(trim("merchant_spellings"."spelling")) > 0),
	CONSTRAINT "merchant_spellings_trimmed" CHECK("merchant_spellings"."spelling" = trim("merchant_spellings"."spelling"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `merchant_spellings_spelling_unique` ON `merchant_spellings` (`spelling`);--> statement-breakpoint
CREATE INDEX `merchant_spellings_merchant_idx` ON `merchant_spellings` (`merchant_id`);--> statement-breakpoint
CREATE TABLE `merchants` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "merchants_name_not_blank" CHECK(length(trim("merchants"."name")) > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `merchants_name_key_unique` ON `merchants` (`name_key`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant` text,
	`merchant_id` text,
	`mcc` integer,
	`category_id` text,
	`to_account_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`to_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "rules_criterion_present" CHECK("__new_rules"."merchant" IS NOT NULL OR "__new_rules"."mcc" IS NOT NULL OR "__new_rules"."merchant_id" IS NOT NULL),
	CONSTRAINT "rules_one_merchant_criterion" CHECK("__new_rules"."merchant" IS NULL OR "__new_rules"."merchant_id" IS NULL),
	CONSTRAINT "rules_merchant_not_blank" CHECK("__new_rules"."merchant" IS NULL OR length(trim("__new_rules"."merchant")) > 0),
	CONSTRAINT "rules_target_exactly_one" CHECK(("__new_rules"."category_id" IS NULL) <> ("__new_rules"."to_account_id" IS NULL))
);
--> statement-breakpoint
-- Hand-corrected (database.md): drizzle-kit selected the new `merchant_id` from the old `rules`,
-- which has no such column; SQLite would read "merchant_id" as a string and fail every row.
INSERT INTO `__new_rules`("id", "merchant", "merchant_id", "mcc", "category_id", "to_account_id", "created_at") SELECT "id", "merchant", NULL, "mcc", "category_id", "to_account_id", "created_at" FROM `rules`;--> statement-breakpoint
DROP TABLE `rules`;--> statement-breakpoint
ALTER TABLE `__new_rules` RENAME TO `rules`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `transactions` ADD `mcc` integer;