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

-- Waitlist table for unapproved sign-in attempts
CREATE TABLE IF NOT EXISTS waitlist (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'pending',
  attempt_count INTEGER DEFAULT 1,
  last_attempt_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_waitlist_created ON waitlist(created_at DESC);

-- AI Ready Billing & Vector RAG Schema Extensions

-- Vector DB / RAG Layer: Chat Embeddings
CREATE TABLE IF NOT EXISTS chat_embeddings (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  customer_wa_id TEXT NOT NULL REFERENCES customers(wa_id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL DEFAULT 0,
  chunk_text TEXT NOT NULL,
  embedding_dimension INTEGER NOT NULL,
  embedding_vector TEXT NOT NULL,
  is_normalized INTEGER NOT NULL DEFAULT 1,
  metadata TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_embeddings_customer ON chat_embeddings(customer_wa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_embeddings_message ON chat_embeddings(message_id);

-- AYUSH Product Catalog
CREATE TABLE IF NOT EXISTS product_catalog (
  id TEXT PRIMARY KEY,
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  classical_name TEXT,
  category TEXT NOT NULL,
  hsn_code TEXT NOT NULL,
  gst_rate REAL NOT NULL,
  unit_mrp REAL NOT NULL,
  unit_measure TEXT NOT NULL,
  stock_quantity INTEGER NOT NULL DEFAULT 100,
  is_active INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_catalog_sku ON product_catalog(sku);
CREATE INDEX IF NOT EXISTS idx_catalog_name ON product_catalog(name);
CREATE INDEX IF NOT EXISTS idx_catalog_category ON product_catalog(category);

-- Billing & Invoices
CREATE TABLE IF NOT EXISTS billing_records (
  id TEXT PRIMARY KEY,
  invoice_number TEXT UNIQUE NOT NULL,
  customer_wa_id TEXT NOT NULL REFERENCES customers(wa_id),
  status TEXT NOT NULL DEFAULT 'draft',
  source_message_id TEXT REFERENCES messages(id),
  source_media_type TEXT,
  extraction_metadata TEXT,
  items_json TEXT NOT NULL,
  subtotal REAL NOT NULL,
  tax_total REAL NOT NULL,
  tax_breakdown_json TEXT NOT NULL,
  discount_total REAL NOT NULL DEFAULT 0.0,
  shipping_fee REAL NOT NULL DEFAULT 0.0,
  rounding_adjustment REAL NOT NULL DEFAULT 0.0,
  grand_total REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  payment_link TEXT,
  notes TEXT,
  formatted_wa_message TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_billing_customer ON billing_records(customer_wa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_invoice ON billing_records(invoice_number);
CREATE INDEX IF NOT EXISTS idx_billing_status ON billing_records(status);


