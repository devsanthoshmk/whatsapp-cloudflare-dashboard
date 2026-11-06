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
