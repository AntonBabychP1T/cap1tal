PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant` text,
	`merchant_id` text,
	`mcc` integer,
	`category_id` text,
	`to_account_id` text,
	`source_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`merchant_id`) REFERENCES `merchants`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`to_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "rules_criterion_present" CHECK("__new_rules"."merchant" IS NOT NULL OR "__new_rules"."mcc" IS NOT NULL OR "__new_rules"."merchant_id" IS NOT NULL),
	CONSTRAINT "rules_one_merchant_criterion" CHECK("__new_rules"."merchant" IS NULL OR "__new_rules"."merchant_id" IS NULL),
	CONSTRAINT "rules_merchant_not_blank" CHECK("__new_rules"."merchant" IS NULL OR length(trim("__new_rules"."merchant")) > 0),
	CONSTRAINT "rules_target_exactly_one" CHECK(("__new_rules"."category_id" IS NOT NULL) + ("__new_rules"."to_account_id" IS NOT NULL) + ("__new_rules"."source_id" IS NOT NULL) = 1)
);
--> statement-breakpoint
-- Hand-corrected (database.md): drizzle-kit selected the new `source_id` from the old `rules`,
-- which has no such column; SQLite would read "source_id" as a string and fail every row.
INSERT INTO `__new_rules`("id", "merchant", "merchant_id", "mcc", "category_id", "to_account_id", "source_id", "created_at") SELECT "id", "merchant", "merchant_id", "mcc", "category_id", "to_account_id", NULL, "created_at" FROM `rules`;--> statement-breakpoint
DROP TABLE `rules`;--> statement-breakpoint
ALTER TABLE `__new_rules` RENAME TO `rules`;--> statement-breakpoint
PRAGMA foreign_keys=ON;