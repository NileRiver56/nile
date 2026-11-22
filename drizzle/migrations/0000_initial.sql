CREATE TABLE `addresses` (
	`id` varchar(64) NOT NULL,
	`user_id` varchar(64) NOT NULL,
	`label` varchar(80) NOT NULL,
	`governorate` varchar(64) NOT NULL,
	`district` varchar(64) NOT NULL,
	`town` varchar(120) NOT NULL,
	`phone` varchar(40) NOT NULL,
	`notes` text,
	`is_default` boolean NOT NULL DEFAULT false,
	CONSTRAINT `addresses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `attributes` (
	`id` varchar(64) NOT NULL,
	`code` varchar(64) NOT NULL,
	`name_json` json NOT NULL,
	`values_json` json NOT NULL,
	CONSTRAINT `attributes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` varchar(64) NOT NULL,
	`actor_user_id` varchar(64),
	`action` varchar(80) NOT NULL,
	`entity_type` varchar(64) NOT NULL,
	`entity_id` varchar(64) NOT NULL,
	`before_json` json,
	`after_json` json,
	`ip_address` varchar(64),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `banners` (
	`id` varchar(64) NOT NULL,
	`title_json` json NOT NULL,
	`bg_token` varchar(32) NOT NULL DEFAULT 'graphite',
	`target_url` varchar(255) NOT NULL,
	`pages_json` json NOT NULL,
	`priority` int NOT NULL DEFAULT 0,
	`impressions` int NOT NULL DEFAULT 0,
	`clicks` int NOT NULL DEFAULT 0,
	`starts_at` timestamp,
	`ends_at` timestamp,
	`active` boolean NOT NULL DEFAULT true,
	CONSTRAINT `banners_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `brands` (
	`id` varchar(64) NOT NULL,
	`slug` varchar(100) NOT NULL,
	`name_json` json NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	CONSTRAINT `brands_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cart_items` (
	`id` varchar(64) NOT NULL,
	`cart_id` varchar(64) NOT NULL,
	`product_id` varchar(64) NOT NULL,
	`variant_id` varchar(64) NOT NULL,
	`quantity` int NOT NULL,
	CONSTRAINT `cart_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `carts` (
	`id` varchar(64) NOT NULL,
	`user_id` varchar(64),
	`guest_token` varchar(128),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `carts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` varchar(64) NOT NULL,
	`parent_id` varchar(64),
	`slug` varchar(100) NOT NULL,
	`department` varchar(40) NOT NULL,
	`name_json` json NOT NULL,
	`commission_bps` int,
	`sort_order` int NOT NULL DEFAULT 0,
	`active` boolean NOT NULL DEFAULT true,
	CONSTRAINT `categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_categories_slug` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `commissions_log` (
	`id` varchar(64) NOT NULL,
	`order_item_id` varchar(64) NOT NULL,
	`seller_id` varchar(64) NOT NULL,
	`applied_bps` int NOT NULL,
	`source_rule` varchar(40) NOT NULL,
	`amount_usd_cents` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `commissions_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `coupons` (
	`id` varchar(64) NOT NULL,
	`code` varchar(64) NOT NULL,
	`seller_id` varchar(64),
	`discount_type` varchar(24) NOT NULL DEFAULT 'percent',
	`discount_value` int NOT NULL,
	`min_order_usd_cents` int NOT NULL DEFAULT 0,
	`max_uses` int,
	`per_customer_limit` int NOT NULL DEFAULT 1,
	`used_count` int NOT NULL DEFAULT 0,
	`starts_at` timestamp,
	`ends_at` timestamp,
	`active` boolean NOT NULL DEFAULT true,
	CONSTRAINT `coupons_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_coupons_code` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `delivery_zones` (
	`governorate_code` varchar(64) NOT NULL,
	`name_json` json NOT NULL,
	`platform_fee_usd_cents` int NOT NULL,
	`eta_days` varchar(32) NOT NULL,
	CONSTRAINT `delivery_zones_governorate_code` PRIMARY KEY(`governorate_code`)
);
--> statement-breakpoint
CREATE TABLE `disputes` (
	`id` varchar(64) NOT NULL,
	`sub_order_id` varchar(64) NOT NULL,
	`opened_by_user_id` varchar(64) NOT NULL,
	`reason` text NOT NULL,
	`status` varchar(24) NOT NULL DEFAULT 'open',
	`resolution_note` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `disputes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `email_log` (
	`id` varchar(64) NOT NULL,
	`recipient_email` varchar(190) NOT NULL,
	`template_key` varchar(64) NOT NULL,
	`status` varchar(32) NOT NULL,
	`error_message` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `email_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `email_templates` (
	`key` varchar(64) NOT NULL,
	`subject_json` json NOT NULL,
	`body_json` json NOT NULL,
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `email_templates_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `error_log` (
	`id` varchar(64) NOT NULL,
	`route` varchar(190) NOT NULL,
	`message` text NOT NULL,
	`stack` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `error_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `home_sections` (
	`id` varchar(64) NOT NULL,
	`section_type` varchar(40) NOT NULL,
	`title_json` json NOT NULL,
	`content_json` json NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	`status` varchar(24) NOT NULL DEFAULT 'draft',
	`audience` varchar(32) NOT NULL DEFAULT 'all',
	`starts_at` timestamp,
	`ends_at` timestamp,
	`version` int NOT NULL DEFAULT 1,
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `home_sections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` varchar(64) NOT NULL,
	`job_type` varchar(64) NOT NULL,
	`payload_json` json NOT NULL,
	`status` varchar(24) NOT NULL DEFAULT 'queued',
	`attempts` int NOT NULL DEFAULT 0,
	`run_at` timestamp NOT NULL DEFAULT (now()),
	`last_error` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ledger_entries` (
	`id` varchar(64) NOT NULL,
	`seller_id` varchar(64) NOT NULL,
	`sub_order_id` varchar(64),
	`order_number` varchar(40),
	`entry_type` varchar(40) NOT NULL,
	`direction` varchar(10) NOT NULL,
	`amount_usd_cents` int NOT NULL,
	`availability` varchar(24) NOT NULL DEFAULT 'pending',
	`note` text NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ledger_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `media` (
	`id` varchar(64) NOT NULL,
	`owner_user_id` varchar(64) NOT NULL,
	`entity_type` varchar(40) NOT NULL,
	`entity_id` varchar(64),
	`storage_driver` varchar(24) NOT NULL DEFAULT 'local',
	`storage_key` varchar(255) NOT NULL,
	`public_url` varchar(255) NOT NULL,
	`mime_type` varchar(80) NOT NULL,
	`size_bytes` int NOT NULL,
	`width` int,
	`height` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `media_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `menus` (
	`id` varchar(64) NOT NULL,
	`location` varchar(32) NOT NULL,
	`items_json` json NOT NULL,
	CONSTRAINT `menus_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` varchar(64) NOT NULL,
	`user_id` varchar(64) NOT NULL,
	`title_json` json NOT NULL,
	`body_json` json NOT NULL,
	`read_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `offers` (
	`id` varchar(64) NOT NULL,
	`seller_id` varchar(64),
	`title_json` json NOT NULL,
	`offer_type` varchar(32) NOT NULL,
	`discount_value` int NOT NULL,
	`target_type` varchar(32) NOT NULL,
	`target_id` varchar(64),
	`approval_status` varchar(24) NOT NULL DEFAULT 'pending',
	`starts_at` timestamp,
	`ends_at` timestamp,
	`active` boolean NOT NULL DEFAULT true,
	CONSTRAINT `offers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` varchar(64) NOT NULL,
	`sub_order_id` varchar(64) NOT NULL,
	`product_id` varchar(64) NOT NULL,
	`variant_id` varchar(64) NOT NULL,
	`title_snapshot_json` json NOT NULL,
	`variant_label` varchar(120) NOT NULL,
	`sku` varchar(80) NOT NULL,
	`quantity` int NOT NULL,
	`unit_price_usd_cents` int NOT NULL,
	`line_total_usd_cents` int NOT NULL,
	`commission_bps_snapshot` int NOT NULL,
	`commission_usd_cents` int NOT NULL,
	CONSTRAINT `order_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`id` varchar(64) NOT NULL,
	`order_number` varchar(40) NOT NULL,
	`user_id` varchar(64),
	`customer_name` varchar(160) NOT NULL,
	`customer_phone` varchar(40) NOT NULL,
	`governorate` varchar(64) NOT NULL,
	`district` varchar(64) NOT NULL,
	`town` varchar(120) NOT NULL,
	`address_notes` text NOT NULL,
	`payment_method` varchar(32) NOT NULL,
	`payment_status` varchar(32) NOT NULL DEFAULT 'pending',
	`coupon_code` varchar(64),
	`exchange_rate_snapshot` bigint NOT NULL,
	`subtotal_usd_cents` int NOT NULL,
	`delivery_total_usd_cents` int NOT NULL,
	`cod_fee_usd_cents` int NOT NULL DEFAULT 0,
	`discount_total_usd_cents` int NOT NULL DEFAULT 0,
	`grand_total_usd_cents` int NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_orders_number` UNIQUE(`order_number`)
);
--> statement-breakpoint
CREATE TABLE `pages` (
	`id` varchar(64) NOT NULL,
	`slug` varchar(120) NOT NULL,
	`title_json` json NOT NULL,
	`body_json` json NOT NULL,
	`published` boolean NOT NULL DEFAULT true,
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pages_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_pages_slug` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `password_resets` (
	`id` varchar(64) NOT NULL,
	`user_id` varchar(64) NOT NULL,
	`token_hash` varchar(128) NOT NULL,
	`purpose` varchar(32) NOT NULL DEFAULT 'password_reset',
	`expires_at` timestamp NOT NULL,
	`used_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `password_resets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` varchar(64) NOT NULL,
	`order_id` varchar(64) NOT NULL,
	`method` varchar(32) NOT NULL,
	`gateway_name` varchar(120) NOT NULL,
	`reference` varchar(160),
	`amount_usd_cents` int NOT NULL,
	`status` varchar(32) NOT NULL,
	`verified_by_user_id` varchar(64),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `payouts` (
	`id` varchar(64) NOT NULL,
	`seller_id` varchar(64) NOT NULL,
	`amount_usd_cents` int NOT NULL,
	`method` varchar(24) NOT NULL,
	`account_details` varchar(190) NOT NULL,
	`status` varchar(24) NOT NULL DEFAULT 'pending',
	`reference_code` varchar(120),
	`settled_by_user_id` varchar(64),
	`settled_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payouts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `permissions` (
	`key` varchar(80) NOT NULL,
	`description` varchar(255) NOT NULL,
	CONSTRAINT `permissions_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `product_variants` (
	`id` varchar(64) NOT NULL,
	`product_id` varchar(64) NOT NULL,
	`sku` varchar(80) NOT NULL,
	`size` varchar(40),
	`color` varchar(64) NOT NULL,
	`color_hex` varchar(16) NOT NULL,
	`stock` int NOT NULL DEFAULT 0,
	`price_delta_usd_cents` int NOT NULL DEFAULT 0,
	CONSTRAINT `product_variants_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `products` (
	`id` varchar(64) NOT NULL,
	`seller_id` varchar(64) NOT NULL,
	`category_id` varchar(64) NOT NULL,
	`brand_id` varchar(64),
	`department` varchar(40) NOT NULL,
	`slug` varchar(160) NOT NULL,
	`title_json` json NOT NULL,
	`subtitle_json` json NOT NULL,
	`description_json` json NOT NULL,
	`specs_json` json NOT NULL,
	`base_price_usd_cents` int NOT NULL,
	`compare_at_usd_cents` int,
	`seller_currency` varchar(5) NOT NULL DEFAULT 'USD',
	`moderation_status` varchar(32) NOT NULL DEFAULT 'pending',
	`published` boolean NOT NULL DEFAULT false,
	`featured` boolean NOT NULL DEFAULT false,
	`model_3d_url` varchar(255),
	`rating_avg_x10` int NOT NULL DEFAULT 0,
	`review_count` int NOT NULL DEFAULT 0,
	`deleted_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `products_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_products_slug` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `returns` (
	`id` varchar(64) NOT NULL,
	`sub_order_id` varchar(64) NOT NULL,
	`user_id` varchar(64) NOT NULL,
	`reason` text NOT NULL,
	`status` varchar(24) NOT NULL DEFAULT 'requested',
	`refund_usd_cents` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `returns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` varchar(64) NOT NULL,
	`product_id` varchar(64) NOT NULL,
	`seller_id` varchar(64) NOT NULL,
	`user_id` varchar(64) NOT NULL,
	`rating` int NOT NULL,
	`comment` text NOT NULL,
	`verified_buyer` boolean NOT NULL DEFAULT true,
	`seller_reply` text,
	`moderation_status` varchar(24) NOT NULL DEFAULT 'approved',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reviews_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`id` varchar(64) NOT NULL,
	`role_key` varchar(40) NOT NULL,
	`permission_key` varchar(80) NOT NULL,
	CONSTRAINT `role_permissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_role_perm` UNIQUE(`role_key`,`permission_key`)
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`key` varchar(40) NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text NOT NULL,
	CONSTRAINT `roles_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `seller_documents` (
	`id` varchar(64) NOT NULL,
	`seller_id` varchar(64) NOT NULL,
	`doc_type` varchar(40) NOT NULL,
	`media_id` varchar(64) NOT NULL,
	`review_status` varchar(32) NOT NULL DEFAULT 'pending',
	`reviewer_note` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `seller_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sellers` (
	`id` varchar(64) NOT NULL,
	`owner_user_id` varchar(64) NOT NULL,
	`business_type` varchar(32) NOT NULL DEFAULT 'individual',
	`legal_name` varchar(190) NOT NULL,
	`commercial_reg_ref` varchar(120) NOT NULL,
	`governorate` varchar(64) NOT NULL,
	`district` varchar(64) NOT NULL,
	`city_address` varchar(255) NOT NULL,
	`phone` varchar(40) NOT NULL,
	`whatsapp_phone` varchar(40) NOT NULL,
	`status` varchar(32) NOT NULL DEFAULT 'draft',
	`status_reason` text,
	`verified` boolean NOT NULL DEFAULT false,
	`custom_commission_bps` int,
	`payout_method` varchar(24) NOT NULL DEFAULT 'whish',
	`payout_account` varchar(190) NOT NULL,
	`onboarding_step` int NOT NULL DEFAULT 1,
	`deleted_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sellers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` varchar(64) NOT NULL,
	`user_id` varchar(64) NOT NULL,
	`token_hash` varchar(128) NOT NULL,
	`csrf_token` varchar(128) NOT NULL,
	`user_agent` varchar(255),
	`ip_address` varchar(64),
	`expires_at` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_sessions_token_hash` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` varchar(80) NOT NULL,
	`value_json` json NOT NULL,
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `settings_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `stock_movements` (
	`id` varchar(64) NOT NULL,
	`variant_id` varchar(64) NOT NULL,
	`delta` int NOT NULL,
	`reason` varchar(64) NOT NULL,
	`reference_id` varchar(64),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stock_movements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `store_settings` (
	`store_id` varchar(64) NOT NULL,
	`delivery_mode` varchar(24) NOT NULL DEFAULT 'platform',
	`self_delivery_fees_json` json NOT NULL,
	`processing_hours` int NOT NULL DEFAULT 24,
	`vacation_mode` boolean NOT NULL DEFAULT false,
	`working_hours_json` json,
	`return_policy_json` json,
	`social_links_json` json,
	`seo_title` varchar(190),
	`seo_description` text,
	CONSTRAINT `store_settings_store_id` PRIMARY KEY(`store_id`)
);
--> statement-breakpoint
CREATE TABLE `stores` (
	`id` varchar(64) NOT NULL,
	`seller_id` varchar(64) NOT NULL,
	`slug` varchar(120) NOT NULL,
	`name_json` json NOT NULL,
	`tagline_json` json NOT NULL,
	`about_json` json NOT NULL,
	`announcement_json` json,
	`department_slug` varchar(40) NOT NULL,
	`theme_id` varchar(40) NOT NULL DEFAULT 'obsidian-ember',
	`logo_media_id` varchar(64),
	`banner_media_id` varchar(64),
	`rating_avg_x10` int NOT NULL DEFAULT 0,
	`review_count` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `stores_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_stores_slug` UNIQUE(`slug`),
	CONSTRAINT `uq_stores_seller` UNIQUE(`seller_id`)
);
--> statement-breakpoint
CREATE TABLE `sub_orders` (
	`id` varchar(64) NOT NULL,
	`order_id` varchar(64) NOT NULL,
	`seller_id` varchar(64) NOT NULL,
	`status` varchar(32) NOT NULL DEFAULT 'pending',
	`delivery_mode` varchar(24) NOT NULL,
	`delivery_fee_usd_cents` int NOT NULL,
	`subtotal_usd_cents` int NOT NULL,
	`discount_usd_cents` int NOT NULL DEFAULT 0,
	`commission_usd_cents` int NOT NULL,
	`seller_net_usd_cents` int NOT NULL,
	`cod_collected` boolean NOT NULL DEFAULT false,
	`courier_name` varchar(120),
	`tracking_code` varchar(120),
	`delivered_at` timestamp,
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sub_orders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `subscription_plans` (
	`tier` varchar(32) NOT NULL,
	`name_json` json NOT NULL,
	`monthly_fee_usd_cents` int NOT NULL,
	`product_limit` int,
	`commission_discount_bps` int NOT NULL DEFAULT 0,
	`features_json` json NOT NULL,
	CONSTRAINT `subscription_plans_tier` PRIMARY KEY(`tier`)
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` varchar(64) NOT NULL,
	`seller_id` varchar(64) NOT NULL,
	`plan_tier` varchar(32) NOT NULL,
	`status` varchar(24) NOT NULL DEFAULT 'active',
	`next_due_at` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `subscriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `support_tickets` (
	`id` varchar(64) NOT NULL,
	`user_id` varchar(64),
	`email` varchar(190) NOT NULL,
	`subject` varchar(190) NOT NULL,
	`message` text NOT NULL,
	`status` varchar(24) NOT NULL DEFAULT 'open',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `support_tickets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `translations` (
	`key` varchar(120) NOT NULL,
	`en` text NOT NULL,
	`ar` text NOT NULL,
	CONSTRAINT `translations_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `user_permissions` (
	`id` varchar(64) NOT NULL,
	`user_id` varchar(64) NOT NULL,
	`permission_key` varchar(80) NOT NULL,
	CONSTRAINT `user_permissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_user_perm` UNIQUE(`user_id`,`permission_key`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar(64) NOT NULL,
	`name` varchar(160) NOT NULL,
	`email` varchar(190) NOT NULL,
	`phone` varchar(40) NOT NULL,
	`password_hash` varchar(255) NOT NULL,
	`role_key` varchar(40) NOT NULL DEFAULT 'customer',
	`email_verified_at` timestamp,
	`phone_verified_at` timestamp,
	`totp_secret` varchar(128),
	`totp_enabled` boolean NOT NULL DEFAULT false,
	`preferred_locale` varchar(5) NOT NULL DEFAULT 'en',
	`preferred_currency` varchar(5) NOT NULL DEFAULT 'USD',
	`failed_login_attempts` int NOT NULL DEFAULT 0,
	`locked_until` timestamp,
	`is_blocked` boolean NOT NULL DEFAULT false,
	`deleted_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_users_email` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `wishlists` (
	`id` varchar(64) NOT NULL,
	`user_id` varchar(64) NOT NULL,
	`product_id` varchar(64) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `wishlists_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_wishlist_user_prod` UNIQUE(`user_id`,`product_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_ledger_seller` ON `ledger_entries` (`seller_id`);--> statement-breakpoint
CREATE INDEX `idx_orders_user` ON `orders` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_variants_product` ON `product_variants` (`product_id`);--> statement-breakpoint
CREATE INDEX `idx_products_seller` ON `products` (`seller_id`);--> statement-breakpoint
CREATE INDEX `idx_products_dept` ON `products` (`department`);--> statement-breakpoint
CREATE INDEX `idx_sellers_status` ON `sellers` (`status`);--> statement-breakpoint
CREATE INDEX `idx_sellers_owner` ON `sellers` (`owner_user_id`);--> statement-breakpoint
CREATE INDEX `idx_sessions_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_sub_orders_order` ON `sub_orders` (`order_id`);--> statement-breakpoint
CREATE INDEX `idx_sub_orders_seller` ON `sub_orders` (`seller_id`);--> statement-breakpoint
CREATE INDEX `idx_users_role` ON `users` (`role_key`);