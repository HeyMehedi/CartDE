-- CartDE 0004: generic key/value settings (theme, enabled extensions). Values are validated JSON written by the app.
CREATE TABLE cartde_settings (
  store_id INTEGER NOT NULL DEFAULT 1,
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (store_id, key)
);
