-- Customers table with denormalized CSW tracker
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  wa_id TEXT UNIQUE NOT NULL,
  phone_number TEXT NOT NULL,
  name TEXT,
  last_inbound_at INTEGER NOT NULL,
  csw_expires_at INTEGER NOT NULL,
  csw_source TEXT DEFAULT 'organic',
  total_messages_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  customer_wa_id TEXT NOT NULL REFERENCES customers(wa_id),
  direction TEXT NOT NULL,
  type TEXT NOT NULL,
  body TEXT,
  media_r2_key TEXT,
  media_url TEXT,
  media_mime TEXT,
  media_filename TEXT,
  media_size INTEGER,
  status TEXT NOT NULL,
  error_code TEXT,
  error_message TEXT,
  raw_payload TEXT,
  created_at INTEGER NOT NULL
);

-- Daily and Monthly quota counters
CREATE TABLE IF NOT EXISTS usage_counters (
  period_key TEXT PRIMARY KEY,
  period_type TEXT NOT NULL,
  service_messages_sent INTEGER DEFAULT 0,
  unique_recipients_count INTEGER DEFAULT 0,
  updated_at INTEGER NOT NULL
);

-- R2 Usage Tracking Table for Zero-Billing Guard
CREATE TABLE IF NOT EXISTS r2_usage (
  period_key TEXT PRIMARY KEY,
  metric_type TEXT NOT NULL,
  storage_bytes INTEGER DEFAULT 0,
  class_a_ops INTEGER DEFAULT 0,
  class_b_ops INTEGER DEFAULT 0,
  is_capped INTEGER DEFAULT 0,
  last_updated INTEGER NOT NULL
);

-- Indices
CREATE INDEX IF NOT EXISTS idx_messages_customer ON messages(customer_wa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_csw ON customers(csw_expires_at);
CREATE INDEX IF NOT EXISTS idx_messages_r2_active ON messages(created_at, media_r2_key, status) WHERE media_r2_key IS NOT NULL;
