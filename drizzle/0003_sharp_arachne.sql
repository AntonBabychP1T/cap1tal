CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rules` (
	`id` text PRIMARY KEY NOT NULL,
	`merchant` text,
	`mcc` integer,
	`category_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "rules_criterion_present" CHECK("rules"."merchant" IS NOT NULL OR "rules"."mcc" IS NOT NULL),
	CONSTRAINT "rules_merchant_not_blank" CHECK("rules"."merchant" IS NULL OR length(trim("rules"."merchant")) > 0)
);
--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
-- The three reserved rows, inserted here and not by the seed on open: the recreate below copies
-- transactions that already carry these ids, and the migrator runs every migration inside one
-- BEGIN, where SQLite makes `PRAGMA foreign_keys=OFF` a no-op. Without these rows the copy fails
-- the new foreign key on any device that has ever recorded a витрата. Their names are fixed —
-- the categories spec forbids renaming or archiving them — so this data can never fight the owner.
INSERT INTO `categories` (`id`, `name`, `archived`) VALUES
	('uncategorised', 'Без категорії', 0),
	('fees', 'Комісія', 0),
	('correction', 'Коригування', 0);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`date` text NOT NULL,
	`created_at` integer DEFAULT 0 NOT NULL,
	`account_id` text,
	`amount` integer,
	`currency` text,
	`category_id` text,
	`source_id` text,
	`original_amount` integer,
	`original_currency` text,
	`from_account_id` text,
	`to_account_id` text,
	`left_amount` integer,
	`left_currency` text,
	`arrived_amount` integer,
	`arrived_currency` text,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`from_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`to_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "transactions_type_known" CHECK("__new_transactions"."type" IN ('expense', 'income', 'transfer', 'refund', 'correction')),
	CONSTRAINT "transactions_date_iso" CHECK("__new_transactions"."date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "transactions_original_amount_paired" CHECK(("__new_transactions"."original_amount" IS NULL) = ("__new_transactions"."original_currency" IS NULL)),
	CONSTRAINT "transactions_shape" CHECK(CASE "__new_transactions"."type"
        WHEN 'transfer' THEN
          "__new_transactions"."from_account_id" IS NOT NULL AND "__new_transactions"."to_account_id" IS NOT NULL
          AND "__new_transactions"."from_account_id" <> "__new_transactions"."to_account_id"
          AND "__new_transactions"."left_amount" IS NOT NULL AND "__new_transactions"."left_currency" IS NOT NULL
          AND "__new_transactions"."arrived_amount" IS NOT NULL AND "__new_transactions"."arrived_currency" IS NOT NULL
          AND "__new_transactions"."account_id" IS NULL AND "__new_transactions"."amount" IS NULL AND "__new_transactions"."currency" IS NULL
          AND "__new_transactions"."category_id" IS NULL AND "__new_transactions"."source_id" IS NULL
          AND "__new_transactions"."original_amount" IS NULL
        ELSE
          "__new_transactions"."account_id" IS NOT NULL AND "__new_transactions"."amount" IS NOT NULL AND "__new_transactions"."currency" IS NOT NULL
          AND "__new_transactions"."from_account_id" IS NULL AND "__new_transactions"."to_account_id" IS NULL
          AND "__new_transactions"."left_amount" IS NULL AND "__new_transactions"."left_currency" IS NULL
          AND "__new_transactions"."arrived_amount" IS NULL AND "__new_transactions"."arrived_currency" IS NULL
          AND (CASE "__new_transactions"."type"
            WHEN 'income' THEN "__new_transactions"."source_id" IS NOT NULL AND "__new_transactions"."category_id" IS NULL
                                AND "__new_transactions"."original_amount" IS NULL
            WHEN 'correction' THEN "__new_transactions"."source_id" IS NULL AND "__new_transactions"."category_id" IS NULL
                                AND "__new_transactions"."original_amount" IS NULL
            WHEN 'refund' THEN "__new_transactions"."category_id" IS NOT NULL AND "__new_transactions"."source_id" IS NULL
                                AND "__new_transactions"."original_amount" IS NULL
            ELSE "__new_transactions"."category_id" IS NOT NULL AND "__new_transactions"."source_id" IS NULL
          END)
      END)
);
--> statement-breakpoint
INSERT INTO `__new_transactions`("id", "type", "date", "created_at", "account_id", "amount", "currency", "category_id", "source_id", "original_amount", "original_currency", "from_account_id", "to_account_id", "left_amount", "left_currency", "arrived_amount", "arrived_currency") SELECT "id", "type", "date", "created_at", "account_id", "amount", "currency", "category_id", "source_id", "original_amount", "original_currency", "from_account_id", "to_account_id", "left_amount", "left_currency", "arrived_amount", "arrived_currency" FROM `transactions`;--> statement-breakpoint
DROP TABLE `transactions`;--> statement-breakpoint
ALTER TABLE `__new_transactions` RENAME TO `transactions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `transactions_date_idx` ON `transactions` (`date`);--> statement-breakpoint
CREATE INDEX `transactions_account_idx` ON `transactions` (`account_id`);--> statement-breakpoint
CREATE INDEX `transactions_from_account_idx` ON `transactions` (`from_account_id`);--> statement-breakpoint
CREATE INDEX `transactions_to_account_idx` ON `transactions` (`to_account_id`);