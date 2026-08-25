CREATE TABLE `saldo_import` (
	`id` text PRIMARY KEY NOT NULL,
	`committed_at` integer NOT NULL,
	CONSTRAINT "saldo_import_single_row" CHECK("saldo_import"."id" = 'saldo')
);
