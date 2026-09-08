CREATE TABLE IF NOT EXISTS `sync_metadata` (
	`id` integer PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sync_outbox` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`table_name` text NOT NULL,
	`record_id` text NOT NULL,
	`operation` text DEFAULT 'INSERT' NOT NULL,
	`row_payload` text,
	`local_updated_at` text,
	`base_remote_updated_at` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`synced_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "sync_outbox_operation_check" CHECK("sync_outbox"."operation" in ('INSERT', 'UPDATE', 'DELETE')),
	CONSTRAINT "sync_outbox_status_check" CHECK("sync_outbox"."status" in ('pending', 'synced', 'conflict', 'error'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_sync_outbox_table_record_unique` ON `sync_outbox` (`table_name`,`record_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_sync_outbox_status` ON `sync_outbox` (`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_sync_outbox_updated_at` ON `sync_outbox` (`updated_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sync_state` (
	`table_name` text PRIMARY KEY NOT NULL,
	`last_pulled_at` text,
	`last_sync_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `order_sync_queue` (
	`order_id` text PRIMARY KEY NOT NULL,
	`operation` text DEFAULT 'UPSERT' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "order_sync_queue_operation_check" CHECK("order_sync_queue"."operation" in ('UPSERT', 'DELETE'))
);

--> statement-breakpoint
INSERT OR IGNORE INTO sync_metadata (id, version) VALUES (1, 0);
