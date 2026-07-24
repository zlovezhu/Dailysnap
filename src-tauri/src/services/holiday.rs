use chrono::{Datelike, Local};

/// Check if the given date is a Chinese holiday
/// This uses a hardcoded list for 2026. In production, you'd fetch this
/// from a holiday API or update the list annually.
pub fn is_holiday(date: &chrono::DateTime<Local>) -> bool {
    let date_str = date.format("%Y-%m-%d").to_string();
    
    // 2026 Chinese public holidays (approximate - should be updated annually)
    let holidays_2026 = vec![
        // 元旦
        "2026-01-01", "2026-01-02", "2026-01-03",
        // 春节
        "2026-02-16", "2026-02-17", "2026-02-18", "2026-02-19",
        "2026-02-20", "2026-02-21", "2026-02-22",
        // 清明节
        "2026-04-04", "2026-04-05", "2026-04-06",
        // 劳动节
        "2026-05-01", "2026-05-02", "2026-05-03", "2026-05-04", "2026-05-05",
        // 端午节
        "2026-06-19", "2026-06-20", "2026-06-21",
        // 中秋节
        "2026-09-25", "2026-09-26", "2026-09-27",
        // 国庆节
        "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04",
        "2026-10-05", "2026-10-06", "2026-10-07",
    ];

    holidays_2026.contains(&date_str.as_str())
}

/// Check if the date is a weekend (Saturday or Sunday)
pub fn is_weekend(date: &chrono::DateTime<Local>) -> bool {
    let weekday = date.weekday();
    weekday == chrono::Weekday::Sat || weekday == chrono::Weekday::Sun
}
