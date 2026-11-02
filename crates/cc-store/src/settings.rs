use crate::{Error, Result, Store};
use cc_types::{ENGINE_SETTING_KEYS, Settings, parse_engine_settings};
use rusqlite::params;

// Persisted subset of Settings, from WP 1.4. Value validation and the closed
// key inventory belong solely to cc-types (parse_engine_settings and
// ENGINE_SETTING_KEYS).

fn validate(settings: &Settings) -> Result<()> {
    parse_engine_settings(settings).map_err(|_| Error::Invalid("engine settings"))?;
    if settings
        .values
        .keys()
        .any(|key| !ENGINE_SETTING_KEYS.contains(&key.as_str()))
    {
        return Err(Error::Invalid("engine settings key"));
    }
    Ok(())
}

impl Store {
    /// Read explicit persisted overrides only. Missing keys retain the sole
    /// parser's defaults; retention_s remains on its existing separate API.
    pub fn engine_settings(&self) -> Result<Settings> {
        self.ready()?;
        let mut stmt = self
            .conn
            .prepare("SELECT key,value FROM engine_settings ORDER BY key")?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        let mut settings = Settings {
            values: Default::default(),
        };
        for row in rows {
            let (key, value) = row?;
            settings.values.insert(key, serde_json::from_str(&value)?);
        }
        validate(&settings)?;
        Ok(settings)
    }

    /// Replace the whole engine.* override map atomically, after validating all
    /// keys and values. An empty map resets overrides; retention_s is untouched.
    /// No paths, endpoints or other setting values are logged.
    pub fn set_engine_settings(&mut self, settings: &Settings) -> Result<()> {
        self.ready()?;
        validate(settings)?;
        let tx = self.conn.transaction()?;
        tx.execute("DELETE FROM engine_settings", [])?;
        for (key, value) in &settings.values {
            tx.execute(
                "INSERT INTO engine_settings (key,value) VALUES (?1,?2)",
                params![key, serde_json::to_string(value)?],
            )?;
        }
        tx.commit()?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    /// cc-types owns the engine key inventory; cc-store must not restate it.
    #[test]
    fn store_settings_source_holds_no_engine_key_literals() {
        let source = include_str!("settings.rs");
        let needle = format!("\"{}.", "engine");
        let hits = source.lines().filter(|line| line.contains(&needle)).count();
        assert_eq!(hits, 0, "engine key literal duplicated in cc-store");
    }
}
