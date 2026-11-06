import type { ProductCatalogItem } from '../types';

export const SEED_AYUSH_PRODUCTS: Omit<ProductCatalogItem, 'id' | 'created_at' | 'updated_at'>[] = [
  // Classical Ayurvedic Medicines (5% GST - HSN 3004 90 11)
  {
    sku: 'AYU-CLA-001',
    name: 'Triphala Churna',
    classical_name: 'Triphala Curna',
    category: 'churna',
    hsn_code: '3004 90 11',
    gst_rate: 0.05,
    unit_mrp: 150.0,
    unit_measure: '100g',
    stock_quantity: 120,
    is_active: 1,
    description: 'Classical tridoshic digestive and colon cleanser formulation containing Haritaki, Bibhitaki, and Amalaki.'
  },
  {
    sku: 'AYU-CLA-002',
    name: 'Ashwagandhadi Lehyam',
    classical_name: 'Asvagandhadi Lehyam',
    category: 'classical_medicine',
    hsn_code: '3004 90 11',
    gst_rate: 0.05,
    unit_mrp: 280.0,
    unit_measure: '500g',
    stock_quantity: 85,
    is_active: 1,
    description: 'Nourishing herbal rasayana jam with Ashwagandha, ghee, and wild honey for stamina and physical strength.'
  },
  {
    sku: 'AYU-CLA-003',
    name: 'Brahmi Vati',
    classical_name: 'Brahmi Vati (Swarna Yukta)',
    category: 'vati_gutika',
    hsn_code: '3004 90 11',
    gst_rate: 0.05,
    unit_mrp: 350.0,
    unit_measure: '60 tabs',
    stock_quantity: 60,
    is_active: 1,
    description: 'Classical medhya rasayana tablet formulation for cognitive focus, memory retention, and mental calming.'
  },
  {
    sku: 'AYU-CLA-004',
    name: 'Ksheerabala 101 Tailam',
    classical_name: 'Kshirabala Tailam 101 Aavartanam',
    category: 'oil_tailam',
    hsn_code: '3004 90 11',
    gst_rate: 0.05,
    unit_mrp: 420.0,
    unit_measure: '200ml',
    stock_quantity: 45,
    is_active: 1,
    description: 'Classical hundred-times fortified milk and Bala herbal oil for arthritis, neuromuscular conditions, and sciatica.'
  },
  {
    sku: 'AYU-CLA-005',
    name: 'Amritharishtam',
    classical_name: 'Amrtaristam',
    category: 'arishtam',
    hsn_code: '3004 90 11',
    gst_rate: 0.05,
    unit_mrp: 190.0,
    unit_measure: '450ml',
    stock_quantity: 90,
    is_active: 1,
    description: 'Classical fermented liquid tonic with Guduchi (Giloy) for chronic fevers, immune depletion, and metabolic detox.'
  },
  {
    sku: 'AYU-CLA-006',
    name: 'Chyawanprash Awaleha',
    classical_name: 'Cyavanaprasa Avaleha',
    category: 'classical_medicine',
    hsn_code: '3004 90 11',
    gst_rate: 0.05,
    unit_mrp: 380.0,
    unit_measure: '500g',
    stock_quantity: 110,
    is_active: 1,
    description: 'Amla-based premier rasayana jam with 40+ rejuvenating herbs for respiratory immunity and vitality.'
  },
  {
    sku: 'AYU-CLA-007',
    name: 'Mahanarayan Tailam',
    classical_name: 'Mahanarayana Tailam',
    category: 'oil_tailam',
    hsn_code: '3004 90 11',
    gst_rate: 0.05,
    unit_mrp: 320.0,
    unit_measure: '100ml',
    stock_quantity: 75,
    is_active: 1,
    description: 'Classical multi-herb sesame oil preparation for massage in joint stiffness, neck pain, and muscle soreness.'
  },
  {
    sku: 'AYU-CLA-008',
    name: 'Yograj Guggulu',
    classical_name: 'Yogaraja Guggulu',
    category: 'vati_gutika',
    hsn_code: '3004 90 11',
    gst_rate: 0.05,
    unit_mrp: 260.0,
    unit_measure: '80 tabs',
    stock_quantity: 95,
    is_active: 1,
    description: 'Purified Guggulu resin formulation for balancing Vata dosha in joints, bones, and tendons.'
  },
  {
    sku: 'AYU-CLA-009',
    name: 'Sitopaladi Churna',
    classical_name: 'Sitopaladi Curna',
    category: 'churna',
    hsn_code: '3004 90 11',
    gst_rate: 0.05,
    unit_mrp: 145.0,
    unit_measure: '60g',
    stock_quantity: 130,
    is_active: 1,
    description: 'Sweet soothing classical powder containing Vanslochan and cardamom for cough, congestion, and chest allergy.'
  },
  {
    sku: 'AYU-CLA-010',
    name: 'Avipattikar Churna',
    classical_name: 'Avipattikara Curna',
    category: 'churna',
    hsn_code: '3004 90 11',
    gst_rate: 0.05,
    unit_mrp: 160.0,
    unit_measure: '100g',
    stock_quantity: 105,
    is_active: 1,
    description: 'Classical Ayurvedic remedy for hyperacidity, gastritis, heartburn, and gentle bowel movement.'
  },
  {
    sku: 'AYU-CLA-011',
    name: 'Maharasnadi Kwatham',
    classical_name: 'Maharasnadi Kasayam',
    category: 'classical_medicine',
    hsn_code: '3004 90 11',
    gst_rate: 0.05,
    unit_mrp: 220.0,
    unit_measure: '200ml',
    stock_quantity: 70,
    is_active: 1,
    description: 'Potent concentrated classical herbal decoction for chronic neurological disorders and osteoarthritis.'
  },

  // Proprietary & Cosmetic Formulations (12% GST - HSN 3004 90 12 / 3304)
  {
    sku: 'AYU-PRO-001',
    name: 'Ayurvedic Hair Growth Vitalizer Oil',
    classical_name: 'Kuntala Vardhana Tailam',
    category: 'proprietary_formulation',
    hsn_code: '3304',
    gst_rate: 0.12,
    unit_mrp: 599.0,
    unit_measure: '200ml',
    stock_quantity: 140,
    is_active: 1,
    description: 'Proprietary herbal hair oil infused with Bhringraj, Amla, and Hibiscus in pure cold-pressed coconut oil.'
  },
  {
    sku: 'AYU-PRO-002',
    name: 'Kumkumadi Tailam Radiant Skin Serum',
    classical_name: 'Kumkumadi Tailam Ultra',
    category: 'proprietary_formulation',
    hsn_code: '3304',
    gst_rate: 0.12,
    unit_mrp: 899.0,
    unit_measure: '30ml',
    stock_quantity: 80,
    is_active: 1,
    description: 'Kashmiri Saffron and 26 precious herbs facial oil for skin brightening, pigmentation correction, and glow.'
  },
  {
    sku: 'AYU-PRO-003',
    name: 'Herbal Pain Relief Balm Ultra',
    classical_name: 'Vedanasamaka Malahara',
    category: 'proprietary_formulation',
    hsn_code: '3004 90 12',
    gst_rate: 0.12,
    unit_mrp: 180.0,
    unit_measure: '50g',
    stock_quantity: 160,
    is_active: 1,
    description: 'Fast-action topical soothing balm with Gaultheria oil, eucalyptus, and camphor for headache and backache.'
  },
  {
    sku: 'AYU-PRO-004',
    name: 'Sandalwood & Turmeric Ubtan Paste',
    classical_name: 'Candana Haridra Ubtan',
    category: 'wellness',
    hsn_code: '3304',
    gst_rate: 0.12,
    unit_mrp: 340.0,
    unit_measure: '150g',
    stock_quantity: 115,
    is_active: 1,
    description: 'Traditional Ayurvedic skin exfoliant with pure Mysore sandalwood, Kasturi manjal, and gram flour.'
  },
  {
    sku: 'AYU-PRO-005',
    name: 'Ortho Care Herbal Joint Roll-On',
    classical_name: 'Sandhisula Hara Lepam',
    category: 'proprietary_formulation',
    hsn_code: '3004 90 12',
    gst_rate: 0.12,
    unit_mrp: 290.0,
    unit_measure: '50ml',
    stock_quantity: 100,
    is_active: 1,
    description: 'Mess-free herbal roll-on with Gandhapura oil, Shallaki, and Nirgundi for targeted joint and neck relief.'
  }
];

export async function ensureDatabaseAndCatalog(db: D1Database): Promise<{ seeded: boolean; count: number }> {
  const ddlStatements = [
    `CREATE TABLE IF NOT EXISTS chat_embeddings (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      customer_wa_id TEXT NOT NULL,
      chunk_index INTEGER NOT NULL DEFAULT 0,
      chunk_text TEXT NOT NULL,
      embedding_dimension INTEGER NOT NULL,
      embedding_vector TEXT NOT NULL,
      is_normalized INTEGER NOT NULL DEFAULT 1,
      metadata TEXT,
      created_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_embeddings_customer ON chat_embeddings(customer_wa_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_embeddings_message ON chat_embeddings(message_id)`,
    `CREATE TABLE IF NOT EXISTS product_catalog (
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
    )`,
    `CREATE INDEX IF NOT EXISTS idx_catalog_sku ON product_catalog(sku)`,
    `CREATE INDEX IF NOT EXISTS idx_catalog_name ON product_catalog(name)`,
    `CREATE INDEX IF NOT EXISTS idx_catalog_category ON product_catalog(category)`,
    `CREATE TABLE IF NOT EXISTS billing_records (
      id TEXT PRIMARY KEY,
      invoice_number TEXT UNIQUE NOT NULL,
      customer_wa_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      source_message_id TEXT,
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
    )`,
    `CREATE INDEX IF NOT EXISTS idx_billing_customer ON billing_records(customer_wa_id, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_billing_invoice ON billing_records(invoice_number)`,
    `CREATE INDEX IF NOT EXISTS idx_billing_status ON billing_records(status)`
  ];

  for (const sql of ddlStatements) {
    try {
      await db.prepare(sql).run();
    } catch (e: any) {
      console.error('[DDL ERROR]:', e?.message || e);
    }
  }

  try {
    // Check if catalog is already populated
    const existing = await db.prepare('SELECT COUNT(*) as cnt FROM product_catalog').first<{ cnt: number }>();
    if (existing && existing.cnt > 0) {
      return { seeded: false, count: existing.cnt };
    }

    // Seed catalog items
    const now = Date.now();
    const statements: D1PreparedStatement[] = [];

    for (let i = 0; i < SEED_AYUSH_PRODUCTS.length; i++) {
      const item = SEED_AYUSH_PRODUCTS[i];
      const id = `prod_${item.sku.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
      statements.push(
        db.prepare(`
          INSERT OR IGNORE INTO product_catalog (
            id, sku, name, classical_name, category, hsn_code,
            gst_rate, unit_mrp, unit_measure, stock_quantity,
            is_active, description, created_at, updated_at
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
        `).bind(
          id,
          item.sku,
          item.name,
          item.classical_name || null,
          item.category,
          item.hsn_code,
          item.gst_rate,
          item.unit_mrp,
          item.unit_measure,
          item.stock_quantity,
          item.is_active,
          item.description || null,
          now,
          now
        )
      );
    }

    if (statements.length > 0) {
      await db.batch(statements);
    }

    return { seeded: true, count: statements.length };
  } catch (err: any) {
    console.error('[CATALOG SEED ERROR]:', err?.message || err);
    return { seeded: false, count: 0 };
  }
}
