CREATE TABLE `dashboard_layout` (
	`id` text PRIMARY KEY NOT NULL,
	`schema_version` integer NOT NULL,
	`items_json` text NOT NULL,
	CONSTRAINT "dashboard_layout_single_row" CHECK("dashboard_layout"."id" = 'home'),
	CONSTRAINT "dashboard_layout_schema_version_positive" CHECK("dashboard_layout"."schema_version" > 0)
);
