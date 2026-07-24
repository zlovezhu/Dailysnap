import Database from "@tauri-apps/plugin-sql";

let db: Database | null = null;

export async function getDb(): Promise<Database> {
  if (!db) {
    db = await Database.load("sqlite:dailysnap.db");
    await initializeDatabase();
  }
  return db;
}

async function initializeDatabase() {
  if (!db) return;

  // Create tables if they don't exist
  await db.execute(`
    CREATE TABLE IF NOT EXISTS records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      ai_question TEXT,
      ai_followup TEXT,
      user_followup_reply TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      date TEXT NOT NULL DEFAULT (date('now', 'localtime'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS daily_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      content TEXT NOT NULL,
      record_ids TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // Insert default settings if not exist
  const defaults = [
    ["reminder_start_time", "09:30"],
    ["reminder_interval_minutes", "120"],
    ["report_generate_time", "18:00"],
    ["holiday_disable", "true"],
    ["api_key", ""],
    ["api_base_url", "https://api.openai.com/v1"],
    ["model_name", "gpt-4o-mini"],
  ];

  for (const [key, value] of defaults) {
    await db.execute(
      "INSERT OR IGNORE INTO settings (key, value) VALUES ($1, $2)",
      [key, value]
    );
  }
}

// --- Records ---

export interface RecordRow {
  id: number;
  content: string;
  ai_question: string | null;
  ai_followup: string | null;
  user_followup_reply: string | null;
  created_at: string;
  date: string;
}

export async function saveRecord(
  content: string,
  aiQuestion?: string | null,
  aiFollowup?: string | null,
  userFollowupReply?: string | null
): Promise<void> {
  const database = await getDb();
  await database.execute(
    `INSERT INTO records (content, ai_question, ai_followup, user_followup_reply) 
     VALUES ($1, $2, $3, $4)`,
    [content, aiQuestion || null, aiFollowup || null, userFollowupReply || null]
  );
}

export async function getRecordsByDate(date: string): Promise<RecordRow[]> {
  const database = await getDb();
  const rows = await database.select<RecordRow[]>(
    "SELECT * FROM records WHERE date = $1 ORDER BY created_at ASC",
    [date]
  );
  return rows;
}

// --- Daily Reports ---

export interface DailyReportRow {
  id: number;
  date: string;
  content: string;
  record_ids: string | null;
  created_at: string;
}

export async function saveDailyReport(
  date: string,
  content: string,
  recordIds: number[]
): Promise<void> {
  const database = await getDb();
  await database.execute(
    "INSERT OR REPLACE INTO daily_reports (date, content, record_ids) VALUES ($1, $2, $3)",
    [date, content, JSON.stringify(recordIds)]
  );
}

export async function getDailyReport(date: string): Promise<DailyReportRow | null> {
  const database = await getDb();
  const rows = await database.select<DailyReportRow[]>(
    "SELECT * FROM daily_reports WHERE date = $1",
    [date]
  );
  return rows.length > 0 ? rows[0] : null;
}

// --- Settings ---

export interface SettingsMap {
  reminder_start_time: string;
  reminder_interval_minutes: string;
  report_generate_time: string;
  holiday_disable: string;
  api_key: string;
  api_base_url: string;
  model_name: string;
}

export async function getAllSettings(): Promise<SettingsMap> {
  const database = await getDb();
  const rows = await database.select<{ key: string; value: string }[]>(
    "SELECT key, value FROM settings"
  );

  const settings: Record<string, string> = {};
  for (const row of rows) {
    settings[row.key] = row.value;
  }

  return {
    reminder_start_time: settings["reminder_start_time"] || "09:30",
    reminder_interval_minutes: settings["reminder_interval_minutes"] || "120",
    report_generate_time: settings["report_generate_time"] || "18:00",
    holiday_disable: settings["holiday_disable"] || "true",
    api_key: settings["api_key"] || "",
    api_base_url: settings["api_base_url"] || "https://api.openai.com/v1",
    model_name: settings["model_name"] || "gpt-4o-mini",
  } as SettingsMap;
}

export async function updateSetting(key: string, value: string): Promise<void> {
  const database = await getDb();
  await database.execute(
    "INSERT OR REPLACE INTO settings (key, value) VALUES ($1, $2)",
    [key, value]
  );
}
