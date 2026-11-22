CREATE TABLE `home_section_versions` (
	`id` varchar(64) NOT NULL,
	`section_id` varchar(64) NOT NULL,
	`version` int NOT NULL,
	`snapshot_json` json NOT NULL,
	`edited_by_user_id` varchar(64),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `home_section_versions_id` PRIMARY KEY(`id`)
);
