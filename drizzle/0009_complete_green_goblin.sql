CREATE TABLE `rule_template_choices` (
	`group_id` text PRIMARY KEY NOT NULL,
	`category_id` text,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE TABLE `rule_template_sweep` (
	`id` text PRIMARY KEY NOT NULL,
	`version` integer NOT NULL,
	CONSTRAINT "rule_template_sweep_single_row" CHECK("rule_template_sweep"."id" = 'sweep')
);
