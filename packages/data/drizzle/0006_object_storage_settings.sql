CREATE TABLE `object_storage_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`endpoint` text,
	`region` text,
	`bucket` text,
	`access_key_id_encrypted` text,
	`secret_access_key_encrypted` text,
	`url_ttl_seconds` integer DEFAULT 900 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "object_storage_settings_singleton_check" CHECK("object_storage_settings"."id" = 1)
);
