ALTER TABLE `banners` ADD COLUMN `placement` varchar(32) NOT NULL DEFAULT 'page_strip';
--> statement-breakpoint
ALTER TABLE `banners` ADD COLUMN `image_url` varchar(500);
--> statement-breakpoint
ALTER TABLE `banners` ADD COLUMN `dismissible` boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE `banners` ADD COLUMN `audience` varchar(32) NOT NULL DEFAULT 'all';
--> statement-breakpoint
ALTER TABLE `banners` ADD COLUMN `device_target` varchar(24) NOT NULL DEFAULT 'all';
--> statement-breakpoint
ALTER TABLE `banners` ADD COLUMN `category_slug` varchar(120);
--> statement-breakpoint
ALTER TABLE `banners` ADD COLUMN `bot_filtered_count` int NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE `marketing_popups` (
	`id` varchar(64) NOT NULL,
	`title_json` json NOT NULL,
	`body_json` json NOT NULL,
	`cta_label_json` json NOT NULL,
	`target_url` varchar(255) NOT NULL DEFAULT '/catalog',
	`image_url` varchar(500),
	`bg_token` varchar(32) NOT NULL DEFAULT 'ember',
	`popup_type` varchar(32) NOT NULL DEFAULT 'promo',
	`trigger_type` varchar(32) NOT NULL DEFAULT 'delay_seconds',
	`trigger_value` int NOT NULL DEFAULT 5,
	`frequency_cap` varchar(32) NOT NULL DEFAULT 'once_per_day',
	`pages_json` json NOT NULL,
	`audience` varchar(32) NOT NULL DEFAULT 'all',
	`device_target` varchar(24) NOT NULL DEFAULT 'all',
	`show_newsletter_form` boolean NOT NULL DEFAULT false,
	`coupon_code` varchar(64),
	`starts_at` timestamp,
	`ends_at` timestamp,
	`active` boolean NOT NULL DEFAULT true,
	`impressions` int NOT NULL DEFAULT 0,
	`conversions` int NOT NULL DEFAULT 0,
	`dismissals` int NOT NULL DEFAULT 0,
	`bot_filtered_count` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `marketing_popups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `featured_placements` (
	`id` varchar(64) NOT NULL,
	`slot_key` varchar(64) NOT NULL,
	`target_type` varchar(24) NOT NULL,
	`target_id` varchar(64) NOT NULL,
	`seller_id` varchar(64) NOT NULL,
	`badge_json` json NOT NULL,
	`priority` int NOT NULL DEFAULT 10,
	`fee_usd_cents` int NOT NULL DEFAULT 0,
	`ledger_charged` boolean NOT NULL DEFAULT false,
	`ledger_entry_id` varchar(64),
	`starts_at` timestamp,
	`ends_at` timestamp,
	`active` boolean NOT NULL DEFAULT true,
	`impressions` int NOT NULL DEFAULT 0,
	`clicks` int NOT NULL DEFAULT 0,
	`bot_filtered_count` int NOT NULL DEFAULT 0,
	`created_by_user_id` varchar(64),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `featured_placements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `marketing_events_dedup` (
	`id` varchar(64) NOT NULL,
	`entity_kind` varchar(24) NOT NULL,
	`entity_id` varchar(64) NOT NULL,
	`event_type` varchar(24) NOT NULL,
	`visitor_hash` varchar(64) NOT NULL,
	`bucket_key` varchar(32) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `marketing_events_dedup_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_mkt_event_dedup` UNIQUE(`entity_kind`,`entity_id`,`event_type`,`visitor_hash`,`bucket_key`)
);
