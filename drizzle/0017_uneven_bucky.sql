CREATE TABLE `challenge_decisions` (
	`key` text PRIMARY KEY NOT NULL,
	`decision` text NOT NULL,
	`decided_at` integer NOT NULL,
	CONSTRAINT "challenge_decisions_known" CHECK("challenge_decisions"."decision" IN ('accepted', 'dismissed')),
	CONSTRAINT "challenge_decisions_key_not_blank" CHECK(length(trim("challenge_decisions"."key")) > 0)
);
--> statement-breakpoint
CREATE TABLE `earned_achievements` (
	`key` text PRIMARY KEY NOT NULL,
	`template` text NOT NULL,
	`achieved_on` text NOT NULL,
	`recorded_at` integer NOT NULL,
	`seen_at` integer,
	`evidence` text NOT NULL,
	CONSTRAINT "earned_achievements_achieved_on_iso" CHECK("earned_achievements"."achieved_on" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "earned_achievements_key_not_blank" CHECK(length(trim("earned_achievements"."key")) > 0),
	CONSTRAINT "earned_achievements_template_not_blank" CHECK(length(trim("earned_achievements"."template")) > 0)
);
--> statement-breakpoint
CREATE TABLE `spending_norms` (
	`currency` text PRIMARY KEY NOT NULL,
	`amount` integer NOT NULL,
	`confirmed_at` integer NOT NULL,
	CONSTRAINT "spending_norms_amount_positive" CHECK("spending_norms"."amount" > 0)
);
