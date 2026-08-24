CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`currency` text NOT NULL,
	`opening_amount` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`date` text NOT NULL,
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
	FOREIGN KEY (`from_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`to_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "transactions_type_known" CHECK("transactions"."type" IN ('expense', 'income', 'transfer', 'refund', 'correction')),
	CONSTRAINT "transactions_date_iso" CHECK("transactions"."date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "transactions_original_amount_paired" CHECK(("transactions"."original_amount" IS NULL) = ("transactions"."original_currency" IS NULL)),
	CONSTRAINT "transactions_shape" CHECK(CASE "transactions"."type"
        WHEN 'transfer' THEN
          "transactions"."from_account_id" IS NOT NULL AND "transactions"."to_account_id" IS NOT NULL
          AND "transactions"."from_account_id" <> "transactions"."to_account_id"
          AND "transactions"."left_amount" IS NOT NULL AND "transactions"."left_currency" IS NOT NULL
          AND "transactions"."arrived_amount" IS NOT NULL AND "transactions"."arrived_currency" IS NOT NULL
          AND "transactions"."account_id" IS NULL AND "transactions"."amount" IS NULL AND "transactions"."currency" IS NULL
          AND "transactions"."category_id" IS NULL AND "transactions"."source_id" IS NULL
          AND "transactions"."original_amount" IS NULL
        ELSE
          "transactions"."account_id" IS NOT NULL AND "transactions"."amount" IS NOT NULL AND "transactions"."currency" IS NOT NULL
          AND "transactions"."from_account_id" IS NULL AND "transactions"."to_account_id" IS NULL
          AND "transactions"."left_amount" IS NULL AND "transactions"."left_currency" IS NULL
          AND "transactions"."arrived_amount" IS NULL AND "transactions"."arrived_currency" IS NULL
          AND (CASE "transactions"."type"
            WHEN 'income' THEN "transactions"."source_id" IS NOT NULL AND "transactions"."category_id" IS NULL
                                AND "transactions"."original_amount" IS NULL
            WHEN 'correction' THEN "transactions"."source_id" IS NULL AND "transactions"."category_id" IS NULL
                                AND "transactions"."original_amount" IS NULL
            WHEN 'refund' THEN "transactions"."category_id" IS NOT NULL AND "transactions"."source_id" IS NULL
                                AND "transactions"."original_amount" IS NULL
            ELSE "transactions"."category_id" IS NOT NULL AND "transactions"."source_id" IS NULL
          END)
      END)
);
--> statement-breakpoint
CREATE INDEX `transactions_date_idx` ON `transactions` (`date`);--> statement-breakpoint
CREATE INDEX `transactions_account_idx` ON `transactions` (`account_id`);--> statement-breakpoint
CREATE INDEX `transactions_from_account_idx` ON `transactions` (`from_account_id`);--> statement-breakpoint
CREATE INDEX `transactions_to_account_idx` ON `transactions` (`to_account_id`);