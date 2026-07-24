-- Work records table
CREATE TABLE IF NOT EXISTS records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    ai_question TEXT,
    ai_followup TEXT,
    user_followup_reply TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    date TEXT NOT NULL DEFAULT (date('now', 'localtime'))
);

-- Daily reports table
CREATE TABLE IF NOT EXISTS daily_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL UNIQUE,
    content TEXT NOT NULL,
    record_ids TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Default settings
INSERT OR IGNORE INTO settings (key, value) VALUES
    ('reminder_start_time', '09:30'),
    ('reminder_interval_minutes', '120'),
    ('report_generate_time', '18:00'),
    ('holiday_disable', 'true'),
    ('api_key', ''),
    ('api_base_url', 'https://api.openai.com/v1'),
    ('model_name', 'gpt-4o-mini');
