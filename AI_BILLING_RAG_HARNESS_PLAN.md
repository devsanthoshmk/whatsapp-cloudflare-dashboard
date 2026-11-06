# AI Billing & Vector RAG Harness Architecture Plan
**Project:** WhatsApp Cloudflare Automation (`whatsapp-cloudflare-dashboard`)  
**Workflow Standard:** `$unity-lite` Multi-Agent Architecture  
**Authoring Standard:** `$writing-for-agents`  
**Execution Target:** Cloudflare Workers + D1 (`whatsapp-db`) + R2 (`whatsapp-media`) + Hono  
**Runtime AI Policy:** Harness & Vector Engine Ready (No external runtime LLM completion API dependencies required)  
**Verification Target:** Cohere Command Reasoning Subagent (`cohere/command-a-reasoning-08-2025`)  

---

## 1. Architectural Decisions & Data Models

### 1.1 Architectural Rationale

1. **Self-Contained Worker Vector Engine**:
   - *Decision*: Implement vector similarity calculations directly in TypeScript within the Cloudflare Worker runtime instead of coupling to external managed vector services (e.g. Pinecone/Qdrant).
   - *Rationale*: D1 stores embeddings alongside message metadata. Cloudflare Workers execute V8 TypedArray operations (`Float32Array`) in microseconds for hundreds of vectors. Pre-filtering by `customer_wa_id` narrows vector candidate pools to typically 10–500 vectors per customer, delivering sub-millisecond similarity scoring with zero external network latency and zero recurring third-party API costs.

2. **Multi-Modal Billing Ingestion Pipeline**:
   - *Decision*: Decouple media retrieval (Cloudflare R2) and extraction logic into standardized tool payloads.
   - *Rationale*: WhatsApp invoices arrive in three forms:
     - *Direct Text*: e.g., "Need 10 boxes of Paracetamol 500mg and 2 bottles of Cough Syrup".
     - *Handwritten Images*: Photos of handwritten chits, receipts, order slips captured via camera and stored in R2.
     - *PDF Documents*: Invoices, purchase orders, delivery notes stored in R2.
     The harness standardizes extraction representations (`ExtractedBillingPayload`) so downstream catalog validation, tax calculations, and D1 invoice creation remain strictly deterministic regardless of source modality.

3. **OpenAPI / JSON Schema Standardized Tool Harness**:
   - *Decision*: Model every tool with strict, standard JSON Schemas conforming to function-calling specifications accepted by Gemini, Cohere, Anthropic, and OpenAI.
   - *Rationale*: Guarantees model interoperability. When runtime LLM orchestration is enabled later, any model can execute tools using the exact same contract without adapter rewrites.

4. **Zero-Billing & D1 Transaction Safety**:
   - *Decision*: Enforce atomic D1 batch statements (`db.batch([...])`) for bill generation and vector indexing.
   - *Rationale*: Prevents orphan line items or unlinked embedding chunks. Complies with the existing R2 zero-billing guardrails by reading media keys without incurring unmonitored egress.

---

### 1.2 D1 Database Schema Extensions

Four new tables extend `schema.sql` to support vector search, catalog matching, and billing records:

```sql
-- ==============================================================================
-- 1. CHAT EMBEDDINGS (Vector Storage for RAG)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS chat_embeddings (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  customer_wa_id TEXT NOT NULL REFERENCES customers(wa_id) ON DELETE CASCADE,
  chunk_index INTEGER DEFAULT 0,
  chunk_text TEXT NOT NULL,
  embedding TEXT NOT NULL, -- JSON-encoded array of IEEE 754 float numbers
  dimensions INTEGER NOT NULL,
  metadata TEXT, -- JSON-encoded metadata (direction, type, timestamp, intent tags)
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_embeddings_customer 
  ON chat_embeddings(customer_wa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_embeddings_message 
  ON chat_embeddings(message_id);

-- ==============================================================================
-- 2. PRODUCT CATALOG (Validation & Standard Pricing Source)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS product_catalog (
  id TEXT PRIMARY KEY,
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'general',
  unit_price REAL NOT NULL,
  currency TEXT DEFAULT 'INR',
  tax_rate REAL DEFAULT 0.0, -- Percentage (e.g., 0.18 for 18% GST)
  unit TEXT DEFAULT 'pcs',   -- 'pcs', 'box', 'kg', 'strip', 'pack'
  aliases TEXT,              -- JSON array of colloquial names & abbreviations
  is_active INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_product_catalog_sku ON product_catalog(sku);
CREATE INDEX IF NOT EXISTS idx_product_catalog_active ON product_catalog(is_active);

-- ==============================================================================
-- 3. BILLS (Invoice / Billing Header)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS bills (
  id TEXT PRIMARY KEY,
  bill_number TEXT UNIQUE NOT NULL,
  customer_wa_id TEXT NOT NULL REFERENCES customers(wa_id),
  message_id TEXT REFERENCES messages(id),
  source_type TEXT NOT NULL, -- 'text', 'image_ocr', 'pdf_ocr', 'manual'
  subtotal REAL NOT NULL,
  tax_amount REAL NOT NULL,
  discount_amount REAL DEFAULT 0.0,
  total_amount REAL NOT NULL,
  currency TEXT DEFAULT 'INR',
  status TEXT DEFAULT 'draft', -- 'draft', 'pending', 'paid', 'cancelled'
  payment_status TEXT DEFAULT 'unpaid', -- 'unpaid', 'partial', 'paid'
  notes TEXT,
  raw_extracted_data TEXT, -- JSON snapshot of extracted payload prior to calculation
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bills_customer ON bills(customer_wa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bills_status ON bills(status);
CREATE INDEX IF NOT EXISTS idx_bills_created ON bills(created_at DESC);

-- ==============================================================================
-- 4. BILL ITEMS (Invoice Line Items)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS bill_items (
  id TEXT PRIMARY KEY,
  bill_id TEXT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  product_id TEXT REFERENCES product_catalog(id),
  sku TEXT,
  description TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit TEXT DEFAULT 'pcs',
  unit_price REAL NOT NULL,
  tax_rate REAL DEFAULT 0.0,
  tax_amount REAL DEFAULT 0.0,
  discount_amount REAL DEFAULT 0.0,
  total_price REAL NOT NULL,
  metadata TEXT -- JSON snapshot of matching score, notes, or extraction confidence
);

CREATE INDEX IF NOT EXISTS idx_bill_items_bill ON bill_items(bill_id);
CREATE INDEX IF NOT EXISTS idx_bill_items_product ON bill_items(product_id);
```

---

## 2. AI Tools Harness Specification (OpenAPI / JSON Schema)

The AI Harness exposes 9 specialized tools through a unified registry (`AiToolRegistry`). Every tool defines strict parameters and return schemas.

### Tool 1: `get_message`
- **Purpose**: Fetch complete message entity by `message_id`, including text, R2 media references, delivery status, and customer identifiers.
- **Parameters Schema**:
  ```json
  {
    "type": "object",
    "properties": {
      "message_id": {
        "type": "string",
        "description": "Unique WhatsApp or internal message identifier"
      }
    },
    "required": ["message_id"],
    "additionalProperties": false
  }
  ```
- **Returns Schema**:
  ```json
  {
    "type": "object",
    "properties": {
      "message": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "customer_wa_id": { "type": "string" },
          "direction": { "type": "string", "enum": ["inbound", "outbound"] },
          "type": { "type": "string" },
          "body": { "type": ["string", "null"] },
          "media_r2_key": { "type": ["string", "null"] },
          "media_url": { "type": ["string", "null"] },
          "media_mime": { "type": ["string", "null"] },
          "media_filename": { "type": ["string", "null"] },
          "status": { "type": "string" },
          "created_at": { "type": "number" }
        },
        "required": ["id", "customer_wa_id", "direction", "type", "status", "created_at"]
      }
    },
    "required": ["message"]
  }
  ```

---

### Tool 2: `query_chat_history`
- **Purpose**: Retrieve historical chronological conversation messages for a customer with direction filtering and pagination.
- **Parameters Schema**:
  ```json
  {
    "type": "object",
    "properties": {
      "customer_wa_id": {
        "type": "string",
        "description": "Customer WhatsApp phone number without plus sign"
      },
      "limit": {
        "type": "integer",
        "description": "Max messages to retrieve (1-100)",
        "default": 20
      },
      "offset": {
        "type": "integer",
        "description": "Pagination offset",
        "default": 0
      },
      "direction": {
        "type": "string",
        "enum": ["all", "inbound", "outbound"],
        "default": "all"
      },
      "before_timestamp": {
        "type": "integer",
        "description": "Optional upper Unix timestamp bound"
      }
    },
    "required": ["customer_wa_id"],
    "additionalProperties": false
  }
  ```
- **Returns Schema**:
  ```json
  {
    "type": "object",
    "properties": {
      "customer_wa_id": { "type": "string" },
      "total_returned": { "type": "integer" },
      "messages": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "id": { "type": "string" },
            "direction": { "type": "string" },
            "type": { "type": "string" },
            "body": { "type": ["string", "null"] },
            "media_r2_key": { "type": ["string", "null"] },
            "created_at": { "type": "number" }
          },
          "required": ["id", "direction", "type", "created_at"]
        }
      }
    },
    "required": ["customer_wa_id", "total_returned", "messages"]
  }
  ```

---

### Tool 3: `rag_search_chats`
- **Purpose**: Execute vector semantic search over indexed conversation embeddings to locate relevant prior messages, past orders, or customer requests.
- **Parameters Schema**:
  ```json
  {
    "type": "object",
    "properties": {
      "query_vector": {
        "type": "array",
        "items": { "type": "number" },
        "description": "Float array embedding representing query text"
      },
      "customer_wa_id": {
        "type": "string",
        "description": "Customer phone number to enforce data isolation"
      },
      "top_k": {
        "type": "integer",
        "description": "Top matching results count",
        "default": 5
      },
      "min_similarity": {
        "type": "number",
        "description": "Cosine similarity floor between 0.0 and 1.0",
        "default": 0.65
      }
    },
    "required": ["query_vector", "customer_wa_id"],
    "additionalProperties": false
  }
  ```
- **Returns Schema**:
  ```json
  {
    "type": "object",
    "properties": {
      "matches": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "id": { "type": "string" },
            "message_id": { "type": "string" },
            "chunk_text": { "type": "string" },
            "similarity": { "type": "number" },
            "metadata": { "type": "object" },
            "created_at": { "type": "number" }
          },
          "required": ["id", "message_id", "chunk_text", "similarity", "created_at"]
        }
      },
      "count": { "type": "integer" }
    },
    "required": ["matches", "count"]
  }
  ```

---

### Tool 4: `index_chat_embedding`
- **Purpose**: Persist a vectorized text chunk into `chat_embeddings` for future semantic RAG retrieval.
- **Parameters Schema**:
  ```json
  {
    "type": "object",
    "properties": {
      "message_id": { "type": "string" },
      "customer_wa_id": { "type": "string" },
      "chunk_text": { "type": "string" },
      "embedding": {
        "type": "array",
        "items": { "type": "number" },
        "description": "Float array embedding values"
      },
      "chunk_index": { "type": "integer", "default": 0 },
      "metadata": { "type": "object" }
    },
    "required": ["message_id", "customer_wa_id", "chunk_text", "embedding"],
    "additionalProperties": false
  }
  ```
- **Returns Schema**:
  ```json
  {
    "type": "object",
    "properties": {
      "success": { "type": "boolean" },
      "embedding_id": { "type": "string" },
      "dimensions": { "type": "integer" }
    },
    "required": ["success", "embedding_id", "dimensions"]
  }
  ```

---

### Tool 5: `extract_billing_from_message`
- **Purpose**: Extract raw billing intent, line items, quantities, and customer instructions from raw WhatsApp content (direct text, handwritten chit image in R2, or PDF invoice in R2).
- **Parameters Schema**:
  ```json
  {
    "type": "object",
    "properties": {
      "source_type": {
        "type": "string",
        "enum": ["text", "image_ocr", "pdf_ocr"],
        "description": "Source modality of message content"
      },
      "raw_text": {
        "type": "string",
        "description": "Direct message text or OCR transcribed text"
      },
      "media_r2_key": {
        "type": "string",
        "description": "R2 key when processing attached image or PDF"
      },
      "customer_wa_id": {
        "type": "string",
        "description": "Customer phone number"
      }
    },
    "required": ["source_type", "customer_wa_id"],
    "additionalProperties": false
  }
  ```
- **Returns Schema**:
  ```json
  {
    "type": "object",
    "properties": {
      "source_type": { "type": "string" },
      "items": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "raw_name": { "type": "string" },
            "quantity": { "type": "number" },
            "unit": { "type": "string" },
            "raw_price": { "type": ["number", "null"] },
            "notes": { "type": ["string", "null"] }
          },
          "required": ["raw_name", "quantity"]
        }
      },
      "notes": { "type": ["string", "null"] },
      "confidence": { "type": "number" }
    },
    "required": ["source_type", "items", "confidence"]
  }
  ```

---

### Tool 6: `validate_catalog_items`
- **Purpose**: Match extracted billing items against `product_catalog` using exact SKU matching, alias resolution, and fuzzy string similarity.
- **Parameters Schema**:
  ```json
  {
    "type": "object",
    "properties": {
      "items": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "raw_name": { "type": "string" },
            "quantity": { "type": "number" },
            "unit": { "type": "string" },
            "raw_price": { "type": ["number", "null"] }
          },
          "required": ["raw_name", "quantity"]
        }
      }
    },
    "required": ["items"],
    "additionalProperties": false
  }
  ```
- **Returns Schema**:
  ```json
  {
    "type": "object",
    "properties": {
      "validated_items": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "product_id": { "type": "string" },
            "sku": { "type": "string" },
            "matched_name": { "type": "string" },
            "raw_name": { "type": "string" },
            "quantity": { "type": "number" },
            "unit": { "type": "string" },
            "unit_price": { "type": "number" },
            "tax_rate": { "type": "number" },
            "match_confidence": { "type": "number" },
            "match_type": { "type": "string", "enum": ["exact_sku", "exact_name", "alias", "fuzzy", "unmatched"] }
          },
          "required": ["raw_name", "quantity", "unit_price", "tax_rate", "match_type"]
        }
      },
      "unmatched_count": { "type": "integer" }
    },
    "required": ["validated_items", "unmatched_count"]
  }
  ```

---

### Tool 7: `calculate_bill`
- **Purpose**: Perform deterministic arithmetic computations for line items, taxes, discounts, and total bill amounts.
- **Parameters Schema**:
  ```json
  {
    "type": "object",
    "properties": {
      "items": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "product_id": { "type": "string" },
            "sku": { "type": "string" },
            "description": { "type": "string" },
            "quantity": { "type": "number" },
            "unit": { "type": "string" },
            "unit_price": { "type": "number" },
            "tax_rate": { "type": "number" },
            "discount_amount": { "type": "number", "default": 0.0 }
          },
          "required": ["description", "quantity", "unit_price", "tax_rate"]
        }
      },
      "order_discount_amount": { "type": "number", "default": 0.0 },
      "currency": { "type": "string", "default": "INR" }
    },
    "required": ["items"],
    "additionalProperties": false
  }
  ```
- **Returns Schema**:
  ```json
  {
    "type": "object",
    "properties": {
      "subtotal": { "type": "number" },
      "tax_amount": { "type": "number" },
      "discount_amount": { "type": "number" },
      "total_amount": { "type": "number" },
      "currency": { "type": "string" },
      "computed_items": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "description": { "type": "string" },
            "quantity": { "type": "number" },
            "unit_price": { "type": "number" },
            "tax_rate": { "type": "number" },
            "tax_amount": { "type": "number" },
            "discount_amount": { "type": "number" },
            "total_price": { "type": "number" }
          },
          "required": ["description", "quantity", "unit_price", "tax_amount", "total_price"]
        }
      }
    },
    "required": ["subtotal", "tax_amount", "discount_amount", "total_amount", "currency", "computed_items"]
  }
  ```

---

### Tool 8: `create_billing_record`
- **Purpose**: Atomically persist the calculated invoice and line items into D1 (`bills` and `bill_items`) using batch statements.
- **Parameters Schema**:
  ```json
  {
    "type": "object",
    "properties": {
      "customer_wa_id": { "type": "string" },
      "message_id": { "type": "string" },
      "source_type": { "type": "string", "enum": ["text", "image_ocr", "pdf_ocr", "manual"] },
      "subtotal": { "type": "number" },
      "tax_amount": { "type": "number" },
      "discount_amount": { "type": "number", "default": 0.0 },
      "total_amount": { "type": "number" },
      "currency": { "type": "string", "default": "INR" },
      "status": { "type": "string", "enum": ["draft", "pending", "paid"], "default": "draft" },
      "notes": { "type": "string" },
      "raw_extracted_data": { "type": "object" },
      "items": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "product_id": { "type": "string" },
            "sku": { "type": "string" },
            "description": { "type": "string" },
            "quantity": { "type": "number" },
            "unit": { "type": "string" },
            "unit_price": { "type": "number" },
            "tax_rate": { "type": "number" },
            "tax_amount": { "type": "number" },
            "discount_amount": { "type": "number" },
            "total_price": { "type": "number" }
          },
          "required": ["description", "quantity", "unit_price", "total_price"]
        }
      }
    },
    "required": ["customer_wa_id", "source_type", "subtotal", "tax_amount", "total_amount", "items"],
    "additionalProperties": false
  }
  ```
- **Returns Schema**:
  ```json
  {
    "type": "object",
    "properties": {
      "success": { "type": "boolean" },
      "bill_id": { "type": "string" },
      "bill_number": { "type": "string" },
      "total_amount": { "type": "number" },
      "items_count": { "type": "integer" }
    },
    "required": ["success", "bill_id", "bill_number", "total_amount", "items_count"]
  }
  ```

---

### Tool 9: `get_customer_rag_context`
- **Purpose**: Assemble a complete multi-perspective RAG context bundle for a customer: profile, 24-hour window status, recent messages, semantically similar prior conversations/orders, and billing history.
- **Parameters Schema**:
  ```json
  {
    "type": "object",
    "properties": {
      "customer_wa_id": { "type": "string" },
      "current_query": { "type": "string" },
      "query_vector": {
        "type": "array",
        "items": { "type": "number" },
        "description": "Optional vector for semantic context lookup"
      },
      "max_history_messages": { "type": "integer", "default": 10 }
    },
    "required": ["customer_wa_id"],
    "additionalProperties": false
  }
  ```
- **Returns Schema**:
  ```json
  {
    "type": "object",
    "properties": {
      "customer": {
        "type": "object",
        "properties": {
          "wa_id": { "type": "string" },
          "name": { "type": ["string", "null"] },
          "is_csw_active": { "type": "boolean" },
          "csw_expires_at": { "type": "number" }
        },
        "required": ["wa_id", "is_csw_active"]
      },
      "recent_messages": { "type": "array" },
      "similar_contexts": { "type": "array" },
      "recent_bills": { "type": "array" }
    },
    "required": ["customer", "recent_messages", "similar_contexts", "recent_bills"]
  }
  ```

---

## 3. Vector RAG Engine Architecture

```text
+─────────────────────────────────────────────────────────────────────────────+
|                     CLOUDFLARE WORKER RAG VECTOR ENGINE                     |
+─────────────────────────────────────────────────────────────────────────────+
                                       │
     1. Inbound Query / Text           ▼
        ┌─────────────────────────────────────────────────────────┐
        │ Query Vector (Float32Array [d=384, 768, or 1536])        │
        └─────────────────────────────────────────────────────────┘
                                       │
                                       ▼
     2. D1 Pre-Filtered Fetch (Customer Data Isolation)
        ┌─────────────────────────────────────────────────────────┐
        │ SELECT id, message_id, chunk_text, embedding, metadata   │
        │ FROM chat_embeddings                                    │
        │ WHERE customer_wa_id = ?1                               │
        │ ORDER BY created_at DESC LIMIT 500                      │
        └─────────────────────────────────────────────────────────┘
                                       │
                                       ▼
     3. High-Speed V8 Cosine Similarity Kernel
        ┌─────────────────────────────────────────────────────────┐
        │ Loop over vectors using TypedArrays:                    │
        │   dot_product = Σ (A[i] * B[i])                         │
        │   norm_A = sqrt(Σ A[i]^2), norm_B = sqrt(Σ B[i]^2)      │
        │   similarity = dot_product / (norm_A * norm_B)          │
        └─────────────────────────────────────────────────────────┘
                                       │
                                       ▼
     4. Min-Similarity Threshold Filter & Top-K Ranking
        ┌─────────────────────────────────────────────────────────┐
        │ Filter: similarity >= min_similarity (default: 0.65)    │
        │ Priority Queue / Top-K Max Sort                         │
        └─────────────────────────────────────────────────────────┘
                                       │
                                       ▼
     5. Synthesized RAG Context Output
        ┌─────────────────────────────────────────────────────────┐
        │ Top-K Matches with relevance scores & original metadata │
        └─────────────────────────────────────────────────────────┘
```

### 3.1 Cosine Similarity Mathematical Specification
Given two vectors $\mathbf{u}, \mathbf{v} \in \mathbb{R}^n$:
$$\text{Sim}(\mathbf{u}, \mathbf{v}) = \frac{\sum_{i=1}^n u_i v_i}{\sqrt{\sum_{i=1}^n u_i^2} \sqrt{\sum_{i=1}^n v_i^2}}$$

In TypeScript:
```typescript
export function cosineSimilarity(a: Float32Array | number[], b: Float32Array | number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i];
    const bi = b[i];
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
```

### 3.2 Performance & Boundary Guarantees
- Vector length checking ensures no array out-of-bounds.
- Normalization check guards against zero-vector division by zero.
- D1 customer partition guarantees zero data leakage across customers.
- 500 vector comparisons in V8 takes < 1.5 milliseconds inside Cloudflare Workers.

---

## 4. Subagent Structure Graph and Execution Group Diagram

### 4.1 Subagent Structure Graph (`$unity-lite`)

```text
                           +-----------------------------------------------+
                           |         LEVEL 0: MAIN THREAD AGENT            |
                           |   (Orchestrator & Environment Controller)     |
                           +-----------------------------------------------+
                                 /                  |                  \
                                /                   |                   \
                               v                    v                    v
              +-----------------------+   +-------------------+   +-------------------------+
              | LEVEL 1: IMPLEMENTER  |   | LEVEL 1: D1/API   |   | LEVEL 1: VERIFIER       |
              | (AI Tools & Vector)   |   | (Storage & Routes)|   | (Cohere Command         |
              | Model: gemini-3.8     |   | Model: gemini-3.8 |   |  Reasoning Subagent)    |
              +-----------------------+   +-------------------+   +-------------------------+
                     /         \                    |                          |
                    v           v                   v                          v
              +-----------+ +-----------+    +---------------+        +----------------------+
              |  Vector   | |  Billing  |    |  Schema & D1  |        | Independent Decision |
              |  Kernel   | | Extraction|    |   Endpoints   |        |  Extraction & Review |
              +-----------+ +-----------+    +---------------+        +----------------------+
```

### 4.2 Execution Group Diagram

```text
[Group 1: Foundation Models & Data Layer]
  ├── Task 1: D1 Migration Schema for Embeddings, Catalog & Bills (`schema.sql`)
  ├── Task 2: Core TypeScript Type Definitions & Interfaces (`src/types/ai-billing.ts`)
  └── Task 3: Vector Math & Cosine Similarity Engine (`src/services/ai/vector-engine.ts`)
         │
         ▼
[Group 2: Harness Core & Extraction Processing]
  ├── Task 4: Standardized AI Tool Registry & Dispatcher (`src/services/ai/tool-registry.ts`)
  ├── Task 5: RAG Chat History & Semantic Search Tools (`src/services/ai/tools/chat-rag-tools.ts`)
  └── Task 6: Multi-Modal Billing Extraction Helpers (`src/services/ai/tools/billing-extraction-tools.ts`)
         │
         ▼
[Group 3: Catalog Validation & Financial Math Calculation]
  ├── Task 7: Product Catalog Validation & Matching (`src/services/ai/tools/catalog-tools.ts`)
  └── Task 8: Bill Calculation & D1 Transaction Persistence (`src/services/ai/tools/billing-calculation-tools.ts`)
         │
         ▼
[Group 4: API Wiring & Verification Suite]
  ├── Task 9: AI Tool Endpoints & Composite Customer Context (`src/handlers/ai-tools.ts`, `src/index.ts`)
  └── Task 10: Cohere Command Reasoning Verification Suite (`tests/ai-billing-harness.test.ts`)
```

---

## 5. Implementation Task Breakdown

### Task 1: D1 Migration Schema for Embeddings, Catalog & Bills
- **Target File**: `schema.sql`
- **Inputs**: Existing `customers`, `messages`, `usage_counters`, `r2_usage` tables.
- **Outputs**: Extended SQL DDL defining `chat_embeddings`, `product_catalog`, `bills`, `bill_items`, plus seed records for catalog.
- **Leading Words**: *Deterministic, strict-types, indexed, partitioned*.
- **Acceptance Criteria**:
  1. All 4 tables created with `IF NOT EXISTS` and foreign key references.
  2. B-tree indexes defined on `(customer_wa_id, created_at DESC)` and `sku`.
  3. Product catalog seeded with sample medical/retail SKUs (e.g., `MED-PCM-500`, `MED-SYR-100`, `GEN-GLV-001`).

### Task 2: Core TypeScript Type Definitions & Interfaces
- **Target File**: `src/types/ai-billing.ts`
- **Inputs**: D1 table specifications and tool parameter contracts.
- **Outputs**: Strong TypeScript interfaces for `ChatEmbedding`, `ProductCatalogItem`, `Bill`, `BillItem`, `AiToolDefinition`, `AiToolCall`, `AiToolResult`.
- **Leading Words**: *Exhaustive, non-null, self-documenting*.
- **Acceptance Criteria**:
  1. Matches all 9 tool input/output JSON schemas.
  2. Exports runtime type guards for tool payload validation.

### Task 3: Vector Math & Cosine Similarity Engine
- **Target File**: `src/services/ai/vector-engine.ts`
- **Inputs**: Serialized float vectors from D1 or runtime arrays.
- **Outputs**: Pure mathematical functions: `cosineSimilarity`, `dotProduct`, `vectorMagnitude`, `topKSimilarVectors`.
- **Leading Words**: *Fast, bounded, allocation-free, numeric-safe*.
- **Acceptance Criteria**:
  1. Handles identical vectors with similarity `1.0 ± 1e-6`.
  2. Handles orthogonal vectors with similarity `0.0`.
  3. Handles opposite vectors with similarity `-1.0`.
  4. Returns `0.0` gracefully on mismatched lengths or zero-magnitude vectors without throwing.

### Task 4: Standardized AI Tool Registry & Dispatcher
- **Target File**: `src/services/ai/tool-registry.ts`
- **Inputs**: Tool definitions and execution handlers.
- **Outputs**: `AiToolRegistry` class with `registerTool`, `getToolDefinitions`, `executeTool`.
- **Leading Words**: *Registry, declarative, uniform, isolated*.
- **Acceptance Criteria**:
  1. `getToolDefinitions()` returns array conforming to OpenAI/Anthropic/Gemini/Cohere function calling schemas.
  2. `executeTool(name, params, env)` executes registered handler with try/catch isolation and structured `{ success, data, error }` return.

### Task 5: RAG Chat History & Semantic Search Tools
- **Target File**: `src/services/ai/tools/chat-rag-tools.ts`
- **Inputs**: D1 database instance, message IDs, customer WA IDs.
- **Outputs**: Tool handlers for `get_message`, `query_chat_history`, `rag_search_chats`, `index_chat_embedding`.
- **Leading Words**: *Isolated, scoped, customer-partitioned*.
- **Acceptance Criteria**:
  1. `get_message` fetches message with resolved R2 media URL.
  2. `query_chat_history` returns chronological descending messages.
  3. `rag_search_chats` fetches embeddings restricted to `customer_wa_id` and ranks them using `vector-engine.ts`.
  4. `index_chat_embedding` stores vector and metadata in `chat_embeddings`.

### Task 6: Multi-Modal Billing Extraction Helpers
- **Target File**: `src/services/ai/tools/billing-extraction-tools.ts`
- **Inputs**: Text messages, OCR text, or handwritten chit representations.
- **Outputs**: Tool handler `extract_billing_from_message` with parsing helpers for text, handwritten chits, and tabular PDF slips.
- **Leading Words**: *Robust, forgiving-parser, structured-output*.
- **Acceptance Criteria**:
  1. Parses freeform text patterns (e.g., "Paracetamol 500mg x 10, Cough syrup 2 bottles").
  2. Parses shorthand lines (e.g., "PCM 500 10pcs 250").
  3. Returns standard `ExtractedBillingItem[]` with confidence scores.

### Task 7: Product Catalog Validation & Matching
- **Target File**: `src/services/ai/tools/catalog-tools.ts`
- **Inputs**: Extracted raw items, D1 `product_catalog` table.
- **Outputs**: Tool handler `validate_catalog_items` with SKU matching, alias lookup, and Levenshtein/trigram fuzzy matching.
- **Leading Words**: *Exact-first, alias-aware, fuzzy-fallback*.
- **Acceptance Criteria**:
  1. Exact SKU matches assigned confidence `1.0`.
  2. Alias matches (e.g., "PCM" -> "Paracetamol") assigned confidence `0.95`.
  3. Fuzzy match resolves typo (e.g., "Paracetaml") to canonical product.
  4. Unmatched items preserved with `match_type: 'unmatched'` and unit price `0.0` or raw price.

### Task 8: Bill Calculation & D1 Transaction Persistence
- **Target File**: `src/services/ai/tools/billing-calculation-tools.ts`
- **Inputs**: Validated line items, order discounts, D1 database.
- **Outputs**: Tool handlers `calculate_bill` and `create_billing_record`.
- **Leading Words**: *Atomic, currency-exact, audited*.
- **Acceptance Criteria**:
  1. `calculate_bill` accurately computes line totals: `qty * unit_price`, line tax: `line_subtotal * tax_rate`, and order total.
  2. `create_billing_record` generates unique `BILL-YYYYMMDD-XXXX` identifier.
  3. Atomically inserts into `bills` and `bill_items` using `c.env.DB.batch(...)`.

### Task 9: AI Harness API Routes & Composite Customer Context
- **Target Files**: `src/handlers/ai-tools.ts`, `src/index.ts`
- **Inputs**: Hono app, Tool Registry, Auth middleware.
- **Outputs**: API endpoints:
  - `GET /api/ai/tools`: Returns catalog of available AI tools and schemas.
  - `POST /api/ai/execute`: Execute a tool by name with arguments.
  - `POST /api/ai/rag/context`: Composite helper endpoint for `get_customer_rag_context`.
  - `POST /api/ai/billing/process`: Full automated pipeline (Extract -> Validate -> Calculate -> Save).
- **Leading Words**: *Protected, ergonomic, composable*.
- **Acceptance Criteria**:
  1. Authenticated via existing `AuthService` session cookie or API key.
  2. Passes CORS and returns structured HTTP 200/400/500 responses.

### Task 10: Cohere Command Reasoning Verification Suite
- **Target File**: `tests/ai-billing-harness.test.ts`
- **Inputs**: Automated test runner executing against mock or staging D1/Worker environment.
- **Outputs**: End-to-end verification script testing all 9 tools, vector math, edge cases, and transaction atomicity.
- **Model**: `cohere/command-a-reasoning-08-2025`
- **Leading Words**: *Exhaustive, rigorous, adversarial, green-bar*.
- **Acceptance Criteria**:
  1. 100% test pass across all 8 verification suites.
  2. Verification subagent evaluates and signs off on architectural decisions.

---

## 6. Verification & Test Plan for Cohere Command Reasoning Subagent

### 6.1 Verification Subagent Configuration
- **Subagent Name**: `cohere-billing-verifier`
- **Assigned Model**: `cohere/command-a-reasoning-08-2025`
- **Execution Mode**: Foreground subagent spawned by Level 0
- **Responsibilities**:
  1. Inspect the codebase implementation against all 9 tool specifications.
  2. Execute the verification test suite (`node --test` or TypeScript test runner).
  3. Conduct Decision Review on vector engine efficiency, catalog fuzzy matching logic, and transaction boundaries.
  4. Certify the implementation as `Completed` or issue specific corrective actions.

### 6.2 Test Suites Specification

| Suite ID | Focus Area | Test Cases |
| :--- | :--- | :--- |
| **Suite 1** | Vector Engine Math | - Cosine similarity of identical vectors equals `1.0`.<br>- Orthogonal vectors equal `0.0`.<br>- Mismatched vector dimensions return `0.0` safely.<br>- Top-K ranking correctly orders descending similarities. |
| **Suite 2** | Tool Registry & Schemas | - All 9 tools registered with non-empty descriptions.<br>- OpenAPI / JSON Schema validation succeeds for valid payloads.<br>- Invalid payloads rejected with specific validation error messages. |
| **Suite 3** | RAG Search & Indexing | - `index_chat_embedding` stores vector into D1.<br>- `rag_search_chats` retrieves relevant chunk with similarity >= 0.7.<br>- Strict customer isolation: queries for Customer B never return Customer A chunks. |
| **Suite 4** | Billing Extraction | - Direct text message parsing extracts line items and quantities.<br>- Shorthand handwritten chit parsing extracts items and units.<br>- Missing prices handled cleanly without NaN. |
| **Suite 5** | Catalog Validation | - Exact SKU lookup succeeds.<br>- Common alias resolution succeeds (e.g. "PCM" -> Paracetamol).<br>- Fuzzy match identifies item with 1-2 character typos.<br>- Unmatched items flagged cleanly. |
| **Suite 6** | Bill Calculation | - Multi-item subtotal matches sum of line items.<br>- Tax computed per item tax rate (e.g. 5%, 12%, 18%).<br>- Order discounts deducted accurately.<br>- Precision rounding to 2 decimal places. |
| **Suite 7** | D1 Atomic Persistence | - `create_billing_record` creates bill header and items in single batch.<br>- Generated bill number adheres to format `BILL-YYYYMMDD-XXXX`.<br>- Foreign keys properly linked. |
| **Suite 8** | End-to-End Billing Flow | - Composite pipeline runs: message -> extract -> validate -> calculate -> persist.<br>- `get_customer_rag_context` aggregates customer, history, vectors, and bills into single context object. |

---

## 7. Decision Review Plan for Verification Agent

Per `$unity-lite`, the Verification Subagent (`cohere/command-a-reasoning-08-2025`) must evaluate these 4 core decisions:

1. **In-Worker Cosine Engine vs External Vector Database**:
   - *Review Criteria*: Verify whether candidate vector sets in D1 remain small enough (< 1000 per customer) to justify CPU execution in Cloudflare Workers without hitting CPU time limits.
2. **Text / Float Array Serialization in D1**:
   - *Review Criteria*: Evaluate JSON array string vs BLOB storage for embedding vectors regarding D1 storage size, parsing performance, and maintenance simplicity.
3. **Fuzzy Catalog Matching Threshold**:
   - *Review Criteria*: Validate whether the Levenshtein / Jaro-Winkler string similarity threshold (e.g., 0.75) avoids false positive product matches in medical/retail billing.
4. **D1 Batch vs Separate Inserts**:
   - *Review Criteria*: Confirm that all bill header and line item insertions are wrapped in `db.batch()` to guarantee transactional atomicity against partial failures.

---

## 8. Completion Acceptance Criteria

The system is certified `Completed` when:
1. `schema.sql` includes `chat_embeddings`, `product_catalog`, `bills`, and `bill_items`.
2. All 9 AI tools are implemented, registered, and executable through `AiToolRegistry`.
3. Vector RAG engine performs sub-millisecond similarity queries on customer-isolated embeddings.
4. Billing pipeline correctly processes direct text, handwritten representations, and PDF references into validated D1 bills.
5. All 8 verification suites pass under the Cohere Command Reasoning verification subagent.
