CREATE INDEX `transactions_category_idx` ON `transactions` (`category_id`);--> statement-breakpoint
CREATE INDEX `transactions_order_idx` ON `transactions` (`date`,`created_at`,`id`);