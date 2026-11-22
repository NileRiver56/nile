ALTER TABLE `media` ADD COLUMN `folder` varchar(64) NOT NULL DEFAULT 'general';
--> statement-breakpoint
ALTER TABLE `media` ADD COLUMN `alt_json` json;
--> statement-breakpoint
ALTER TABLE `media` ADD COLUMN `focal_x` int NOT NULL DEFAULT 50;
--> statement-breakpoint
ALTER TABLE `media` ADD COLUMN `focal_y` int NOT NULL DEFAULT 50;
--> statement-breakpoint
ALTER TABLE `home_sections` ADD COLUMN `visible` boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE `home_sections` ADD COLUMN `targeting_json` json;
--> statement-breakpoint
ALTER TABLE `home_sections` ADD COLUMN `style_json` json;
--> statement-breakpoint
ALTER TABLE `home_sections` ADD COLUMN `schedule_priority` int NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `home_sections` ADD COLUMN `updated_by_user_id` varchar(64);
--> statement-breakpoint
ALTER TABLE `home_section_versions` ADD COLUMN `change_note` varchar(255);
--> statement-breakpoint
CREATE TABLE `home_section_templates` (
	`id` varchar(64) NOT NULL,
	`name_json` json NOT NULL,
	`description_json` json NOT NULL,
	`section_type` varchar(40) NOT NULL,
	`content_json` json NOT NULL,
	`style_json` json,
	`is_system` boolean NOT NULL DEFAULT false,
	`created_by_user_id` varchar(64),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `home_section_templates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `home_page_snapshots` (
	`id` varchar(64) NOT NULL,
	`version` int NOT NULL,
	`status` varchar(24) NOT NULL DEFAULT 'published',
	`change_note` varchar(255),
	`sections_snapshot_json` json NOT NULL,
	`chrome_snapshot_json` json NOT NULL,
	`scheduled_publish_at` timestamp,
	`published_at` timestamp,
	`created_by_user_id` varchar(64),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `home_page_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `newsletter_subscribers` (
	`id` varchar(64) NOT NULL,
	`email` varchar(190) NOT NULL,
	`locale` varchar(5) NOT NULL DEFAULT 'en',
	`source` varchar(64) NOT NULL DEFAULT 'home',
	`status` varchar(24) NOT NULL DEFAULT 'subscribed',
	`unsubscribe_token` varchar(96) NOT NULL,
	`consented_at` timestamp NOT NULL DEFAULT (now()),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `newsletter_subscribers_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_newsletter_email` UNIQUE(`email`)
);
