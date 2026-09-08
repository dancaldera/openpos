ALTER TABLE `users` ADD `pin_enabled` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD `pin_hash` text;
