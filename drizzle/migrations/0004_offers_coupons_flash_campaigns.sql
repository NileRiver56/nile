ALTER TABLE `coupons` ADD COLUMN `max_discount_usd_cents` int;
--> statement-breakpoint
ALTER TABLE `coupons` ADD COLUMN `target_type` varchar(32) NOT NULL DEFAULT 'all';
--> statement-breakpoint
ALTER TABLE `coupons` ADD COLUMN `target_id` varchar(64);
--> statement-breakpoint
ALTER TABLE `coupons` ADD COLUMN `campaign_id` varchar(64);
--> statement-breakpoint
ALTER TABLE `coupons` ADD COLUMN `first_order_only` boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE `coupons` ADD COLUMN `auto_generated_batch` varchar(64);
--> statement-breakpoint
CREATE TABLE `coupon_redemptions` (
	`id` varchar(64) NOT NULL,
	`coupon_id` varchar(64) NOT NULL,
	`user_id` varchar(64),
	`customer_phone_norm` varchar(40) NOT NULL,
	`order_id` varchar(64) NOT NULL,
	`discount_usd_cents` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `coupon_redemptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_coupon_redemptions_lookup` ON `coupon_redemptions` (`coupon_id`,`user_id`,`customer_phone_norm`);
--> statement-breakpoint
ALTER TABLE `offers` ADD COLUMN `stacking_rule` varchar(24) NOT NULL DEFAULT 'best_only';
--> statement-breakpoint
ALTER TABLE `offers` ADD COLUMN `funding_source` varchar(24) NOT NULL DEFAULT 'platform';
--> statement-breakpoint
ALTER TABLE `offers` ADD COLUMN `funding_platform_bps` int NOT NULL DEFAULT 10000;
--> statement-breakpoint
ALTER TABLE `offers` ADD COLUMN `campaign_id` varchar(64);
--> statement-breakpoint
ALTER TABLE `offers` ADD COLUMN `priority` int NOT NULL DEFAULT 10;
--> statement-breakpoint
ALTER TABLE `offers` ADD COLUMN `rules_json` json;
--> statement-breakpoint
CREATE TABLE `flash_sales` (
	`id` varchar(64) NOT NULL,
	`slug` varchar(120) NOT NULL,
	`title_json` json NOT NULL,
	`bg_token` varchar(32) NOT NULL DEFAULT 'ember',
	`starts_at` timestamp NOT NULL,
	`ends_at` timestamp NOT NULL,
	`status` varchar(24) NOT NULL DEFAULT 'scheduled',
	`auto_revert` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `flash_sales_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_flash_sales_slug` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `flash_sale_items` (
	`id` varchar(64) NOT NULL,
	`flash_sale_id` varchar(64) NOT NULL,
	`product_id` varchar(64) NOT NULL,
	`sale_price_usd_cents` int NOT NULL,
	`discount_percent` int NOT NULL,
	`stock_cap` int NOT NULL DEFAULT 0,
	`claimed_count` int NOT NULL DEFAULT 0,
	CONSTRAINT `flash_sale_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_flash_items_sale` ON `flash_sale_items` (`flash_sale_id`);
--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` varchar(64) NOT NULL,
	`slug` varchar(120) NOT NULL,
	`title_json` json NOT NULL,
	`subtitle_json` json NOT NULL,
	`description_json` json NOT NULL,
	`hero_image_url` varchar(500),
	`bg_token` varchar(32) NOT NULL DEFAULT 'ember',
	`starts_at` timestamp,
	`ends_at` timestamp,
	`status` varchar(24) NOT NULL DEFAULT 'draft',
	`featured_offer_ids_json` json NOT NULL,
	`featured_coupon_codes_json` json NOT NULL,
	`featured_flash_sale_id` varchar(64),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `campaigns_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_campaigns_slug` UNIQUE(`slug`)
);
