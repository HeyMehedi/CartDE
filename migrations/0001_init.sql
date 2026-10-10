-- CartDE 0001: commerce core (store, catalogue, inventory, counters).
-- Forward-only. Orders, customers and the audit log arrive in later migrations.

CREATE TABLE cartde_store (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'BDT',
  locale TEXT NOT NULL DEFAULT 'en-BD',
  timezone TEXT NOT NULL DEFAULT 'Asia/Dhaka',
  status TEXT NOT NULL DEFAULT 'setup' CHECK (status IN ('setup', 'active', 'paused')),
  contact_phone TEXT,
  contact_email TEXT,
  address_text TEXT,
  delivery_inside_dhaka_minor INTEGER NOT NULL DEFAULT 0 CHECK (delivery_inside_dhaka_minor >= 0),
  delivery_outside_dhaka_minor INTEGER NOT NULL DEFAULT 0 CHECK (delivery_outside_dhaka_minor >= 0),
  low_stock_threshold INTEGER NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
  setup_completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE cartde_categories (
  id TEXT PRIMARY KEY,
  store_id INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE cartde_products (
  id TEXT PRIMARY KEY,
  store_id INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description_md TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  featured_media_id TEXT,
  seo_title TEXT,
  seo_description TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_cartde_products_status ON cartde_products (status);

CREATE TABLE cartde_product_categories (
  product_id TEXT NOT NULL REFERENCES cartde_products (id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES cartde_categories (id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, category_id)
);
CREATE INDEX idx_cartde_product_categories_category ON cartde_product_categories (category_id);

CREATE TABLE cartde_product_media (
  id TEXT PRIMARY KEY,
  store_id INTEGER NOT NULL DEFAULT 1,
  product_id TEXT NOT NULL REFERENCES cartde_products (id) ON DELETE CASCADE,
  media_id TEXT NOT NULL,
  alt TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_cartde_product_media_product ON cartde_product_media (product_id);

CREATE TABLE cartde_product_options (
  id TEXT PRIMARY KEY,
  store_id INTEGER NOT NULL DEFAULT 1,
  product_id TEXT NOT NULL REFERENCES cartde_products (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  UNIQUE (product_id, name)
);

CREATE TABLE cartde_product_option_values (
  id TEXT PRIMARY KEY,
  store_id INTEGER NOT NULL DEFAULT 1,
  option_id TEXT NOT NULL REFERENCES cartde_product_options (id) ON DELETE CASCADE,
  value TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  UNIQUE (option_id, value)
);

CREATE TABLE cartde_variants (
  id TEXT PRIMARY KEY,
  store_id INTEGER NOT NULL DEFAULT 1,
  product_id TEXT NOT NULL REFERENCES cartde_products (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  sku TEXT UNIQUE,
  price_minor INTEGER NOT NULL CHECK (price_minor >= 0),
  compare_at_minor INTEGER CHECK (compare_at_minor IS NULL OR compare_at_minor >= 0),
  stock_qty INTEGER NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_cartde_variants_product ON cartde_variants (product_id);

CREATE TABLE cartde_variant_option_values (
  variant_id TEXT NOT NULL REFERENCES cartde_variants (id) ON DELETE CASCADE,
  option_value_id TEXT NOT NULL REFERENCES cartde_product_option_values (id) ON DELETE CASCADE,
  PRIMARY KEY (variant_id, option_value_id)
);

CREATE TABLE cartde_inventory_events (
  id TEXT PRIMARY KEY,
  store_id INTEGER NOT NULL DEFAULT 1,
  variant_id TEXT NOT NULL REFERENCES cartde_variants (id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('order', 'cancel', 'return', 'manual', 'import')),
  order_id TEXT,
  actor_user_id TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_cartde_inventory_events_variant ON cartde_inventory_events (variant_id);

CREATE TABLE cartde_counters (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
INSERT INTO cartde_counters (name, value) VALUES ('order_number', 1000);
