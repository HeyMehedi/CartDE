-- CartDE 0002: customers, orders, order items and order events (cash on delivery).

CREATE TABLE cartde_customers (
  id TEXT PRIMARY KEY,
  store_id INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  email TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE cartde_customer_addresses (
  id TEXT PRIMARY KEY,
  store_id INTEGER NOT NULL DEFAULT 1,
  customer_id TEXT NOT NULL REFERENCES cartde_customers (id) ON DELETE CASCADE,
  recipient_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  line1 TEXT NOT NULL,
  line2 TEXT,
  area TEXT NOT NULL,
  district TEXT NOT NULL,
  postal_code TEXT,
  instructions TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_cartde_customer_addresses_customer ON cartde_customer_addresses (customer_id);

CREATE TABLE cartde_orders (
  id TEXT PRIMARY KEY,
  store_id INTEGER NOT NULL DEFAULT 1,
  order_number INTEGER NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled', 'returned')),
  payment_method TEXT NOT NULL DEFAULT 'cod' CHECK (payment_method IN ('cod')),
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'refunded')),
  currency TEXT NOT NULL,
  subtotal_minor INTEGER NOT NULL CHECK (subtotal_minor >= 0),
  delivery_minor INTEGER NOT NULL CHECK (delivery_minor >= 0),
  discount_minor INTEGER NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  total_minor INTEGER NOT NULL CHECK (total_minor >= 0),
  customer_id TEXT REFERENCES cartde_customers (id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT,
  ship_recipient_name TEXT NOT NULL,
  ship_phone TEXT NOT NULL,
  ship_line1 TEXT NOT NULL,
  ship_line2 TEXT,
  ship_area TEXT NOT NULL,
  ship_district TEXT NOT NULL,
  ship_postal_code TEXT,
  ship_instructions TEXT,
  customer_note TEXT,
  merchant_note TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  placed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (total_minor = subtotal_minor + delivery_minor - discount_minor)
);
CREATE INDEX idx_cartde_orders_status ON cartde_orders (status);
CREATE INDEX idx_cartde_orders_phone ON cartde_orders (customer_phone);
CREATE INDEX idx_cartde_orders_placed ON cartde_orders (placed_at);

CREATE TABLE cartde_order_items (
  id TEXT PRIMARY KEY,
  store_id INTEGER NOT NULL DEFAULT 1,
  order_id TEXT NOT NULL REFERENCES cartde_orders (id) ON DELETE CASCADE,
  product_id TEXT,
  variant_id TEXT REFERENCES cartde_variants (id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  variant_title TEXT NOT NULL,
  sku TEXT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_minor INTEGER NOT NULL CHECK (unit_price_minor >= 0),
  line_total_minor INTEGER NOT NULL CHECK (line_total_minor = unit_price_minor * quantity)
);
CREATE INDEX idx_cartde_order_items_order ON cartde_order_items (order_id);

CREATE TABLE cartde_order_events (
  id TEXT PRIMARY KEY,
  store_id INTEGER NOT NULL DEFAULT 1,
  order_id TEXT NOT NULL REFERENCES cartde_orders (id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor_user_id TEXT,
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_cartde_order_events_order ON cartde_order_events (order_id);
