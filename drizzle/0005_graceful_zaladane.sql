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
	FOREIGN KEY (`monobank_account_id`) REFERENCES `monobank_accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "monobank_links_start_date_iso" CHECK("monobank_links"."sync_start_date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `monobank_links_account_id_unique` ON `monobank_links` (`account_id`);--> statement-breakpoint
ALTER TABLE `transactions` ADD `description` text;