-- Migration 0005: Customer Segments, Email Block Campaigns, Automated Marketing Flows

CREATE TABLE IF NOT EXISTS `customer_segments` (
  `id` varchar(64) NOT NULL,
  `name_json` json NOT NULL,
  `description` varchar(400) NOT NULL DEFAULT '',
  `rules_json` json NOT NULL,
  `cached_member_count` int NOT NULL DEFAULT 0,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `customer_segments_id` PRIMARY KEY (`id`)
);

CREATE TABLE IF NOT EXISTS `email_campaigns` (
  `id` varchar(64) NOT NULL,
  `name` varchar(160) NOT NULL,
  `subject_json` json NOT NULL,
  `preview_text_json` json NOT NULL,
  `segment_id` varchar(64),
  `blocks_json` json NOT NULL,
  `status` varchar(24) NOT NULL DEFAULT 'draft',
  `scheduled_at` timestamp NULL,
  `sent_count` int NOT NULL DEFAULT 0,
  `failed_count` int NOT NULL DEFAULT 0,
  `unsubscribed_count` int NOT NULL DEFAULT 0,
  `sent_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `email_campaigns_id` PRIMARY KEY (`id`)
);

CREATE TABLE IF NOT EXISTS `automation_flows` (
  `id` varchar(64) NOT NULL,
  `name_json` json NOT NULL,
  `trigger_type` varchar(40) NOT NULL,
  `delay_hours` int NOT NULL DEFAULT 0,
  `subject_json` json NOT NULL,
  `blocks_json` json NOT NULL,
  `attach_coupon_code` varchar(64),
  `active` boolean NOT NULL DEFAULT true,
  `total_triggered` int NOT NULL DEFAULT 0,
  `total_sent` int NOT NULL DEFAULT 0,
  `last_run_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `automation_flows_id` PRIMARY KEY (`id`)
);

CREATE TABLE IF NOT EXISTS `automation_executions` (
  `id` varchar(64) NOT NULL,
  `flow_id` varchar(64) NOT NULL,
  `dedup_key` varchar(160) NOT NULL,
  `recipient_email` varchar(190) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `automation_executions_id` PRIMARY KEY (`id`),
  CONSTRAINT `uq_automation_flow_dedup` UNIQUE (`flow_id`, `dedup_key`)
);
