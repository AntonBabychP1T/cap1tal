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
CREATE UNIQUE INDEX `receipt_items_line` ON `receipt_items` (`receipt_id`,`line`);