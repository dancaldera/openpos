CREATE TABLE `connection_meta` (
	`id` integer PRIMARY KEY NOT NULL,
	`connection_key` text NOT NULL,
	`seed_verifier` text NOT NULL,
	`store_name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "connection_meta_singleton_check" CHECK("connection_meta"."id" = 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_connection_meta_connection_key_unique` ON `connection_meta` (`connection_key`);
