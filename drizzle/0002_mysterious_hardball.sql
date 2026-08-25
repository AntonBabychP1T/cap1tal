CREATE TABLE `monobank_rates` (
	`currency` text PRIMARY KEY NOT NULL,
	`rate_millionths` integer NOT NULL,
	`obtained_at` integer NOT NULL,
	CONSTRAINT "monobank_rates_rate_positive" CHECK("monobank_rates"."rate_millionths" > 0)
);
