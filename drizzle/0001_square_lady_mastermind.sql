ALTER TABLE `accounts` ADD `archived` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `created_at` integer DEFAULT 0 NOT NULL;