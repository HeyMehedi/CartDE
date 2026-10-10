-- CartDE 0003: audit log (FR-ADM-7) and draft discounts (FR-AI-3 create_discount_draft).
-- Discounts are stored as drafts only; applying them at checkout is not implemented yet.

CREATE TABLE cartde_audit_log (
  id TEXT PRIMARY KEY,
  store_id INTEGER NOT NULL DEFAULT 1,
  actor_user_id TEXT,
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('user', 'mcp', 'system')),
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_cartde_audit_created ON cartde_audit_log (created_at);
CREATE INDEX idx_cartde_audit_entity ON cartde_audit_log (entity, entity_id);

CREATE TABLE cartde_discounts (
  id TEXT PRIMARY KEY,
  store_id INTEGER NOT NULL DEFAULT 1,
  code TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('percent', 'fixed')),
  value INTEGER NOT NULL CHECK (value > 0),
  min_subtotal_minor INTEGER NOT NULL DEFAULT 0 CHECK (min_subtotal_minor >= 0),
  starts_at TEXT,
  ends_at TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (kind != 'percent' OR value <= 100)
);
