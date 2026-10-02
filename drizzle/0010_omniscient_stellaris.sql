CREATE TABLE `duplicate_answers` (
	`first_id` text NOT NULL,
	`second_id` text NOT NULL,
	`answered_at` integer NOT NULL,
	PRIMARY KEY(`first_id`, `second_id`),
	FOREIGN KEY (`first_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`second_id`) REFERENCES `transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "duplicate_answers_pair_sorted" CHECK("duplicate_answers"."first_id" < "duplicate_answers"."second_id")
);
--> statement-breakpoint
CREATE INDEX `duplicate_answers_second_idx` ON `duplicate_answers` (`second_id`);