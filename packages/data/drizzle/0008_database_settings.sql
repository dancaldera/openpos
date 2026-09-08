CREATE TABLE `database_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`database_url` text,
	`auth_token_encrypted` text,
	`api_token_encrypted` text,
	`org` text,
	`group_name` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "database_settings_singleton_check" CHECK("database_settings"."id" = 1)
);
