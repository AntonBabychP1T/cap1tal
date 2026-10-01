CREATE TABLE `installment_part_links` (
	`installment_id` text NOT NULL,
	`number` integer NOT NULL,
	`transaction_id` text NOT NULL,
	PRIMARY KEY(`installment_id`, `number`),
	FOREIGN KEY (`installment_id`) REFERENCES `installments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "installment_part_links_number_positive" CHECK("installment_part_links"."number" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `installment_part_links_transaction_id_unique` ON `installment_part_links` (`transaction_id`);--> statement-breakpoint
CREATE TABLE `installment_part_marks` (
	`installment_id` text NOT NULL,
	`number` integer NOT NULL,
	PRIMARY KEY(`installment_id`, `number`),
	FOREIGN KEY (`installment_id`) REFERENCES `installments`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "installment_part_marks_number_positive" CHECK("installment_part_marks"."number" >= 1)
);
--> statement-breakpoint
CREATE TABLE `installment_refusals` (
	`installment_id` text NOT NULL,
	`number` integer NOT NULL,
	`transaction_id` text NOT NULL,
	PRIMARY KEY(`installment_id`, `number`, `transaction_id`),
	FOREIGN KEY (`installment_id`) REFERENCES `installments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "installment_refusals_number_positive" CHECK("installment_refusals"."number" >= 1)
);
--> statement-breakpoint
CREATE TABLE `installment_reminder` (
	`id` integer PRIMARY KEY NOT NULL,
	`enabled` integer NOT NULL,
	`asked` integer NOT NULL,
	CONSTRAINT "installment_reminder_single_row" CHECK("installment_reminder"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `installments` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`total_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`parts_count` integer NOT NULL,
	`part_minor` integer NOT NULL,
	`first_due` text NOT NULL,
	`debit_account_id` text NOT NULL,
	`paid_before` integer NOT NULL,
	`category_id` text,
	`recorded_at` integer NOT NULL,
	`closed_on` text,
	FOREIGN KEY (`debit_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "installments_name_not_blank" CHECK(length(trim("installments"."name")) > 0),
	CONSTRAINT "installments_currency_uah" CHECK("installments"."currency" = 'UAH'),
	CONSTRAINT "installments_total_positive" CHECK("installments"."total_minor" > 0),
	CONSTRAINT "installments_parts_count_range" CHECK("installments"."parts_count" BETWEEN 2 AND 60),
	CONSTRAINT "installments_part_positive" CHECK("installments"."part_minor" > 0),
	CONSTRAINT "installments_last_part_positive" CHECK("installments"."total_minor" - ("installments"."parts_count" - 1) * "installments"."part_minor" > 0),
	CONSTRAINT "installments_paid_before_range" CHECK("installments"."paid_before" >= 0 AND "installments"."paid_before" < "installments"."parts_count"),
	CONSTRAINT "installments_first_due_iso" CHECK("installments"."first_due" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "installments_closed_on_iso" CHECK("installments"."closed_on" IS NULL OR "installments"."closed_on" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);
--> statement-breakpoint
CREATE INDEX `installments_debit_account_idx` ON `installments` (`debit_account_id`);