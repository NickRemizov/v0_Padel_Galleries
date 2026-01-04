-- Migration: Rename telegram fields for clarity
-- telegram_name -> telegram_full_name (display name from Telegram)
-- telegram_nickname -> telegram_username (unique @username)
-- show_telegram_nickname -> show_telegram_username (privacy setting)

ALTER TABLE people RENAME COLUMN telegram_name TO telegram_full_name;
ALTER TABLE people RENAME COLUMN telegram_nickname TO telegram_username;
ALTER TABLE people RENAME COLUMN show_telegram_nickname TO show_telegram_username;
