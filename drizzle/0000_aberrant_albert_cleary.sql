CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`currency` text NOT NULL,
	`opening_amount` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `alerts` (
	`kind` text PRIMARY KEY NOT NULL,
	`raised_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bug_report_capture` (
	`id` text PRIMARY KEY NOT NULL,
	`gesture_enabled` integer NOT NULL,
	`handle_enabled` integer NOT NULL,
	CONSTRAINT "bug_report_capture_single_row" CHECK("bug_report_capture"."id" = 'capture')
);
--> statement-breakpoint
CREATE TABLE `bug_report_screenshots` (
	`report_id` text NOT NULL,
	`name` text NOT NULL,
	`added_at` integer NOT NULL,
	PRIMARY KEY(`report_id`, `name`),
	FOREIGN KEY (`report_id`) REFERENCES `bug_reports`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `bug_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`route` text NOT NULL,
	`did` text NOT NULL,
	`happened` text,
	`expected` text,
	`prompting_json` text,
	`build_json` text NOT NULL,
	`device_json` text NOT NULL,
	`counts_json` text NOT NULL,
	`journal_json` text NOT NULL,
	`migrations_applied` integer NOT NULL,
	`handed_over_at` integer,
	`origin` text,
	`capture_failure` text
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `category_limits` (
	`category_id` text PRIMARY KEY NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "category_limits_amount_positive" CHECK("category_limits"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE `challenge_decisions` (
	`key` text PRIMARY KEY NOT NULL,
	`decision` text NOT NULL,
	`decided_at` integer NOT NULL,
	CONSTRAINT "challenge_decisions_known" CHECK("challenge_decisions"."decision" IN ('accepted', 'dismissed')),
	CONSTRAINT "challenge_decisions_key_not_blank" CHECK(length(trim("challenge_decisions"."key")) > 0)
);
--> statement-breakpoint
CREATE TABLE `daily_reminder` (
	`id` text PRIMARY KEY NOT NULL,
	`enabled` integer NOT NULL,
	`hour` integer NOT NULL,
	`minute` integer NOT NULL,
	CONSTRAINT "daily_reminder_single_row" CHECK("daily_reminder"."id" = 'reminder'),
	CONSTRAINT "daily_reminder_hour_of_day" CHECK("daily_reminder"."hour" BETWEEN 0 AND 23),
	CONSTRAINT "daily_reminder_minute_of_hour" CHECK("daily_reminder"."minute" BETWEEN 0 AND 59)
);
--> statement-breakpoint
CREATE TABLE `drive_backup` (
	`id` text PRIMARY KEY NOT NULL,
	`account_label` text,
	`recovery_code_acknowledged_at` integer,
	`last_success_at` integer,
	`last_uploaded_checksum` text,
	`last_failure_kind` text,
	`last_failure_at` integer,
	CONSTRAINT "drive_backup_single_row" CHECK("drive_backup"."id" = 'drive')
);
--> statement-breakpoint
CREATE TABLE `earned_achievements` (
	`key` text PRIMARY KEY NOT NULL,
	`template` text NOT NULL,
	`achieved_on` text NOT NULL,
	`recorded_at` integer NOT NULL,
	`seen_at` integer,
	`evidence` text NOT NULL,
	CONSTRAINT "earned_achievements_achieved_on_iso" CHECK("earned_achievements"."achieved_on" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "earned_achievements_key_not_blank" CHECK(length(trim("earned_achievements"."key")) > 0),
	CONSTRAINT "earned_achievements_template_not_blank" CHECK(length(trim("earned_achievements"."template")) > 0)
);
--> statement-breakpoint
CREATE TABLE `entry_defaults` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "entry_defaults_single_row" CHECK("entry_defaults"."id" = 'entry')
);
--> statement-breakpoint
CREATE TABLE `fiscal_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_id` text NOT NULL,
	`registrar_number` text NOT NULL,
	`fiscal_number` text NOT NULL,
	`issued_date` text NOT NULL,
	`issued_time` text NOT NULL,
	`dialect` text NOT NULL,
	`kind` text NOT NULL,
	`total_amount` integer NOT NULL,
	`total_currency` text NOT NULL,
	`seller_name` text,
	`point_name` text,
	`acquisition` text NOT NULL,
	`fetched_at` integer NOT NULL,
	`snapshot` text NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "fiscal_receipts_dialect_known" CHECK("fiscal_receipts"."dialect" IN ('prro', 'rro')),
	CONSTRAINT "fiscal_receipts_kind_known" CHECK("fiscal_receipts"."kind" IN ('sale', 'return')),
	CONSTRAINT "fiscal_receipts_acquisition_known" CHECK("fiscal_receipts"."acquisition" IN ('qr_scan')),
	CONSTRAINT "fiscal_receipts_issued_date_iso" CHECK("fiscal_receipts"."issued_date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "fiscal_receipts_issued_time_of_day" CHECK("fiscal_receipts"."issued_time" GLOB '[0-2][0-9]:[0-5][0-9]:[0-5][0-9]')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fiscal_receipts_transaction_id_unique` ON `fiscal_receipts` (`transaction_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `fiscal_receipts_identity` ON `fiscal_receipts` (`registrar_number`,`fiscal_number`,`issued_date`);--> statement-breakpoint
CREATE TABLE `goal_accounts` (
	`goal_id` text NOT NULL,
	`account_id` text NOT NULL,
	PRIMARY KEY(`goal_id`, `account_id`),
	FOREIGN KEY (`goal_id`) REFERENCES `goals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `goals` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`deadline` text,
	CONSTRAINT "goals_amount_positive" CHECK("goals"."amount" > 0),
	CONSTRAINT "goals_name_not_blank" CHECK(length(trim("goals"."name")) > 0),
	CONSTRAINT "goals_deadline_iso" CHECK("goals"."deadline" IS NULL OR "goals"."deadline" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);
--> statement-breakpoint
CREATE TABLE `investment_values` (
	`account_id` text PRIMARY KEY NOT NULL,
	`amount` integer NOT NULL,
	`currency` text NOT NULL,
	`as_of` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "investment_values_amount_not_negative" CHECK("investment_values"."amount" >= 0),
	CONSTRAINT "investment_values_as_of_iso" CHECK("investment_values"."as_of" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);
--> statement-breakpoint
CREATE TABLE `journal` (
	`id` text PRIMARY KEY NOT NULL,
	`at` integer NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`detail` text,
	`run` text,
	`took_ms` integer,
	`counts_json` text
);
--> statement-breakpoint
CREATE TABLE `monobank_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`currency` text NOT NULL,
	`bank_balance_amount` integer NOT NULL,
	`obtained_at` integer NOT NULL,
	CONSTRAINT "monobank_accounts_kind_known" CHECK("monobank_accounts"."kind" IN ('card', 'jar'))
);
--> statement-breakpoint
CREATE TABLE `monobank_imported_items` (
	`monobank_account_id` text NOT NULL,
	`item_id` text NOT NULL,
	PRIMARY KEY(`monobank_account_id`, `item_id`),
	FOREIGN KEY (`monobank_account_id`) REFERENCES `monobank_accounts`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `monobank_links` (
	`monobank_account_id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`sync_start_date` text NOT NULL,
	`cursor_ms` integer NOT NULL,
	`last_synced_at` integer,
	`last_attempted_at` integer,
	`paging_window_to_ms` integer,
	`paging_request_to_ms` integer,
	FOREIGN KEY (`monobank_account_id`) REFERENCES `monobank_accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "monobank_links_start_date_iso" CHECK("monobank_links"."sync_start_date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `monobank_links_account_id_unique` ON `monobank_links` (`account_id`);--> statement-breakpoint
CREATE TABLE `monobank_rates` (
	`currency` text PRIMARY KEY NOT NULL,
	`rate_millionths` integer NOT NULL,
	`obtained_at` integer NOT NULL,
	CONSTRAINT "monobank_rates_rate_positive" CHECK("monobank_rates"."rate_millionths" > 0)
);
--> statement-breakpoint
CREATE TABLE `monobank_request_pace` (
	`id` text PRIMARY KEY NOT NULL,
	`last_request_at` integer NOT NULL,
	CONSTRAINT "monobank_request_pace_single_row" CHECK("monobank_request_pace"."id" = 'pace')
);
--> statement-breakpoint
CREATE TABLE `monobank_sync_attempt` (
	`id` text PRIMARY KEY NOT NULL,
	`attempted_at` integer NOT NULL,
	`outcome` text,
	CONSTRAINT "monobank_sync_attempt_single_row" CHECK("monobank_sync_attempt"."id" = 'attempt')
);
--> statement-breakpoint
CREATE TABLE `notification_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`currency` text NOT NULL,
	`date` text NOT NULL,
	`text` text NOT NULL,
	`kind` text NOT NULL,
	`amount` integer,
	`original_amount` integer,
	`original_currency` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "notification_drafts_kind_known" CHECK("notification_drafts"."kind" IN ('expense', 'income', 'raw')),
	CONSTRAINT "notification_drafts_date_iso" CHECK("notification_drafts"."date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "notification_drafts_original_paired" CHECK(("notification_drafts"."original_amount" IS NULL) = ("notification_drafts"."original_currency" IS NULL)),
	CONSTRAINT "notification_drafts_shape" CHECK(CASE "notification_drafts"."kind"
        WHEN 'raw' THEN "notification_drafts"."amount" IS NULL
        ELSE "notification_drafts"."amount" IS NOT NULL AND "notification_drafts"."original_amount" IS NULL
      END)
);
--> statement-breakpoint
CREATE TABLE `notification_fingerprints` (
	`fingerprint` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notification_watches` (
	`package_name` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `receipt_items` (
	`id` text PRIMARY KEY NOT NULL,
	`receipt_id` text NOT NULL,
	`line` integer NOT NULL,
	`raw_name` text NOT NULL,
	`quantity_thousandths` integer NOT NULL,
	`unit` text,
	`unit_price_amount` integer,
	`unit_price_currency` text,
	`line_total_amount` integer NOT NULL,
	`line_total_currency` text NOT NULL,
	`discount_amount` integer,
	`discount_currency` text,
	`barcode` text,
	`uktzed` text,
	`code` text,
	FOREIGN KEY (`receipt_id`) REFERENCES `fiscal_receipts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "receipt_items_unit_price_paired" CHECK(("receipt_items"."unit_price_amount" IS NULL) = ("receipt_items"."unit_price_currency" IS NULL)),
	CONSTRAINT "receipt_items_discount_paired" CHECK(("receipt_items"."discount_amount" IS NULL) = ("receipt_items"."discount_currency" IS NULL)),
	CONSTRAINT "receipt_items_quantity_positive" CHECK("receipt_items"."quantity_thousandths" > 0)
);
--> statement-breakpoint
CREATE INDEX `receipt_items_barcode_idx` ON `receipt_items` (`barcode`);--> statement-breakpoint
CREATE UNIQUE INDEX `receipt_items_line` ON `receipt_items` (`receipt_id`,`line`);--> statement-breakpoint
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
CREATE TABLE `saldo_import` (
	`id` text PRIMARY KEY NOT NULL,
	`committed_at` integer NOT NULL,
	CONSTRAINT "saldo_import_single_row" CHECK("saldo_import"."id" = 'saldo')
);
--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `spending_norms` (
	`currency` text PRIMARY KEY NOT NULL,
	`amount` integer NOT NULL,
	`confirmed_at` integer NOT NULL,
	CONSTRAINT "spending_norms_amount_positive" CHECK("spending_norms"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE `transactions` (
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
	`description` text,
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