CREATE TABLE `commitment_due_links` (
	`commitment_id` text NOT NULL,
	`number` integer NOT NULL,
	`transaction_id` text NOT NULL,
	PRIMARY KEY(`commitment_id`, `number`),
	FOREIGN KEY (`commitment_id`) REFERENCES `commitments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "commitment_due_links_number_positive" CHECK("commitment_due_links"."number" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `commitment_due_links_transaction_id_unique` ON `commitment_due_links` (`transaction_id`);--> statement-breakpoint
CREATE TABLE `commitment_due_marks` (
	`commitment_id` text NOT NULL,
	`number` integer NOT NULL,
	`kind` text NOT NULL,
	PRIMARY KEY(`commitment_id`, `number`),
	FOREIGN KEY (`commitment_id`) REFERENCES `commitments`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "commitment_due_marks_number_positive" CHECK("commitment_due_marks"."number" >= 1),
	CONSTRAINT "commitment_due_marks_kind_known" CHECK("commitment_due_marks"."kind" IN ('paid', 'skipped'))
);
--> statement-breakpoint
CREATE TABLE `commitment_refusals` (
	`commitment_id` text NOT NULL,
	`number` integer NOT NULL,
	`transaction_id` text NOT NULL,
	PRIMARY KEY(`commitment_id`, `number`, `transaction_id`),
	FOREIGN KEY (`commitment_id`) REFERENCES `commitments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "commitment_refusals_number_positive" CHECK("commitment_refusals"."number" >= 1)
);
--> statement-breakpoint
CREATE TABLE `commitments` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`periodicity` text NOT NULL,
	`first_due` text NOT NULL,
	`debit_account_id` text NOT NULL,
	`category_id` text,
	`marker` text,
	`recorded_at` integer NOT NULL,
	`stopped_on` text,
	FOREIGN KEY (`debit_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "commitments_name_not_blank" CHECK(length(trim("commitments"."name")) > 0),
	CONSTRAINT "commitments_amount_positive" CHECK("commitments"."amount_minor" > 0),
	CONSTRAINT "commitments_periodicity_known" CHECK("commitments"."periodicity" IN ('monthly', 'quarterly', 'halfYearly', 'yearly')),
	CONSTRAINT "commitments_first_due_iso" CHECK("commitments"."first_due" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "commitments_stopped_on_iso" CHECK("commitments"."stopped_on" IS NULL OR "commitments"."stopped_on" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "commitments_marker_length" CHECK("commitments"."marker" IS NULL OR length(trim("commitments"."marker")) >= 3)
);
--> statement-breakpoint
CREATE INDEX `commitments_debit_account_idx` ON `commitments` (`debit_account_id`);