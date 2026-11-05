# Cloudflare WhatsApp Webhook, Storage, and Dashboard Plan

## Objective

Build and deploy a full-stack WhatsApp messaging system on a Cloudflare free account (`connectwithsanthoshmk@gmail.com`).

The system receives, stores, and displays WhatsApp customer messages, voice notes, images, and documents. It stores incoming media files in Cloudflare R2 object storage with an airtight zero-billing protection guard. It tracks customer service windows and free message limits in real time. It provides a web dashboard for manual conversations and audit logging, structured for automated AI replies to be added later.

Testing uses subagent curl calls and OpenChamber browser automation through a client testing API (`window.site`), with no test runner files (no pytest or jest).

---

## 1. Cloudflare Free Tier Resource Budget and Zero-Billing Guarantee

The architecture runs strictly within Cloudflare free tier quotas. To guarantee zero billing, the system enforces safety ceilings set at 90 percent of provider limits:

* Cloudflare Workers: 100,000 requests per day.
* Worker Static Assets: Free and unlimited requests, 25 MiB max file size.
* Cloudflare D1 Database: 5,000,000 rows read per day, 100,000 rows written per day, 500 MB per database limit, 5 GB account storage.
* Cloudflare R2 Object Storage:
  * Hard limit: 10.0 GB monthly standard storage. Safety ceiling: 9.0 GB.
  * Hard limit: 1,000,000 Class A operations per month. Safety ceiling: 900,000.
  * Hard limit: 10,000,000 Class B operations per month. Safety ceiling: 9,000,000.
  * Egress bandwidth: Free ($0.00).
* Customer Service Messages: 1,000 free service messages per calendar month from Meta.
* Daily Active Recipients: 250 unique phone numbers per rolling 24 hours under tier 250.

---

## 2. Technical Architecture

A single Cloudflare Worker project contains the API backend, webhook receiver, media storage pipeline with zero-billing guard, and static dashboard frontend.

```
                    ┌────────────────────────────────────────────────────────┐
                    │               Cloudflare Edge Worker                   │
                    │                                                        │
Incoming Webhook ──>│  POST /webhook (Meta / YCloud Events)                  │
(Text, Media)       │    ├── HMAC Signature & Token Verification             │
                    │    ├── Deduplicate via wamid (INSERT OR IGNORE)        │
                    │    ├── Pre-check R2 Ceilings (9.0 GB / 900k ops)       │
                    │    │     ├── OK: Stream Media to R2 Bucket             │
                    │    │     └── Capped: Record text, skip R2 put          │
                    │    └── Update Customers & 24h/72h Window in D1         │
                    │                                                        │
Browser / Agent  ──>│  GET / (Static Assets via Vite SPA)                    │
                    │  GET /api/conversations (Customer threads)             │
                    │  GET /api/messages/:wa_id (Chat history)               │
                    │  GET /api/media/:key (Stream R2 voice, images, files)  │
                    │  POST /api/send (Outbound API reply via YCloud)        │
                    │  GET /api/stats (Quota, R2 storage, & balance tracking)│
                    │                                                        │
                    │  Bindings:                                             │
                    │    - D1 Database: DB (SQLite)                          │
                    │    - R2 Bucket: MEDIA_BUCKET (Object Storage)          │
                    └────────────────────────────────────────────────────────┘
```

---

## 3. Database Schema (Cloudflare D1)

```sql
-- Customers table
CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,               -- e.g. "cust_917904127446"
  wa_id TEXT UNIQUE NOT NULL,        -- "917904127446"
  phone_number TEXT NOT NULL,        -- "+91 79041 27446"
  name TEXT,                         -- Customer profile name
  last_inbound_at INTEGER NOT NULL,  -- UNIX timestamp in seconds
  csw_expires_at INTEGER NOT NULL,   -- UNIX timestamp in seconds
  csw_source TEXT DEFAULT 'organic', -- 'organic' (24h) or 'ad' (72h)
  total_messages_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,               -- Meta wamid or YCloud message id
  customer_wa_id TEXT NOT NULL REFERENCES customers(wa_id),
  direction TEXT NOT NULL,           -- 'inbound' or 'outbound'
  type TEXT NOT NULL,                -- 'text', 'image', 'audio', 'document', 'video', 'template'
  body TEXT,                         -- Text body or media caption
  media_r2_key TEXT,                 -- Storage key in Cloudflare R2 bucket
  media_url TEXT,                    -- Internal media endpoint: /api/media/:key
  media_mime TEXT,                   -- MIME type (image/jpeg, audio/ogg, application/pdf)
  media_filename TEXT,               -- Original file name for documents
  media_size INTEGER,                -- File size in bytes
  status TEXT NOT NULL,              -- 'received', 'accepted', 'delivered', 'read', 'failed', 'media_capped_free_limit'
  error_code TEXT,                   -- Meta error code if send failed
  error_message TEXT,                -- Error description (e.g. window expired or R2 capped)
  raw_payload TEXT,                  -- Complete event JSON for audit and debugging
  created_at INTEGER NOT NULL
);

-- Daily and Monthly quota counters
CREATE TABLE IF NOT EXISTS usage_counters (
  period_key TEXT PRIMARY KEY,       -- e.g. "month_2026-11" or "day_2026-11-05"
  period_type TEXT NOT NULL,         -- 'monthly' or 'daily'
  service_messages_sent INTEGER DEFAULT 0,
  unique_recipients_count INTEGER DEFAULT 0,
  updated_at INTEGER NOT NULL
);

-- R2 Usage Tracking Table for Zero-Billing Guard
CREATE TABLE IF NOT EXISTS r2_usage (
  period_key TEXT PRIMARY KEY,       -- 'cumulative_storage' or month format 'month_2026-11'
  metric_type TEXT NOT NULL,         -- 'storage' or 'operations'
  storage_bytes INTEGER DEFAULT 0,   -- Active bytes stored in bucket
  class_a_ops INTEGER DEFAULT 0,     -- Put, multipart, list operations count
  class_b_ops INTEGER DEFAULT 0,     -- Get, head operations count
  is_capped INTEGER DEFAULT 0,       -- 1 if limit ceiling reached, 0 otherwise
  last_updated INTEGER NOT NULL      -- UNIX timestamp in seconds
);

-- Indices for query performance
CREATE INDEX IF NOT EXISTS idx_messages_customer ON messages(customer_wa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_csw ON customers(csw_expires_at);
CREATE INDEX IF NOT EXISTS idx_messages_r2_active ON messages(created_at, media_r2_key, status) WHERE media_r2_key IS NOT NULL;
```

---

## 4. R2 Zero-Billing Guard and Resource Exhaust Protocol

To guarantee the user is never billed for R2 storage or operations:

### 4.1 Safety Ceilings
* Storage Ceiling: 9.0 GB (hard limit is 10.0 GB).
* Class A Operations Ceiling: 900,000 writes per month (hard limit is 1,000,000).
* Class B Operations Ceiling: 9,000,000 reads per month (hard limit is 10,000,000).
* Automatic 30-Day Lifecycle: R2 bucket lifecycle rule deletes objects older than 30 days, keeping average storage around 3.0 GB.

### 4.2 Pre-Operation Verification
Before any `MEDIA_BUCKET.put()` call runs:
1. The Worker executes a single fast read against `r2_usage` in D1.
2. If `current_storage + incoming_bytes >= 9.0 GB` or `class_a_ops >= 900,000`:
   The guard activates the resource exhaust protocol.

### 4.3 Resource Exhaust Protocol
* Webhook Inbound (`POST /webhook`):
  1. Return HTTP `200 OK` to Meta/YCloud to prevent retry loops.
  2. Skip the upstream media fetch and skip `MEDIA_BUCKET.put()`.
  3. Store the text message and metadata in D1 with `status = 'media_capped_free_limit'` and `media_r2_key = NULL`.
  4. Note in message body: `[Media download skipped: R2 free limit reached]`.
* Direct File Upload API (`POST /api/upload`):
  1. Return HTTP `507 Insufficient Storage` with header `Retry-After`.
  2. Response body:
     ```json
     {
       "error": "RESOURCE_EXHAUSTED",
       "code": "R2_FREE_TIER_LIMIT_REACHED",
       "message": "Cloudflare R2 free tier safety ceiling reached (9.0 GB or 900,000 Class A ops). Upload rejected to guarantee zero billing."
     }
     ```
* Media Read API (`GET /api/media/:key`):
  1. Serve files with immutable edge caching: `Cache-Control: public, max-age=31536000, immutable`.
  2. Repeated views hit Cloudflare edge cache and consume zero R2 Class B operations.

---

## 5. Customer Service Window (CSW) and Limit Engine

Meta rules define when a business can reply without paying for message templates:

1. Standard inbound message:
   `csw_expires_at = message_timestamp + (24 * 3600)`.
2. Click-to-WhatsApp ad referral message:
   `csw_expires_at = message_timestamp + (72 * 3600)`.
3. If `current_timestamp < csw_expires_at`:
   Free service reply is permitted.
4. If `current_timestamp >= csw_expires_at`:
   The window is closed. Free text will be rejected by Meta with error 131047. The dashboard blocks free-text sending, displays an explicit limit badge, and provides options for manual outreach or template messaging.

---

## 6. Dashboard User Interface

The dashboard interface uses modern, responsive CSS with dark mode support.

### Views and Controls

1. Header metrics bar:
   * Connected business status: Santhosh Freelancing (`+91 91766 50591`).
   * Monthly free message tracker: Count sent versus 1,000 monthly allowance.
   * Daily unique recipients tracker: Count reached versus 250 daily limit.
   * Account wallet balance: Shows current balance ($0.50).
   * R2 Storage status: Active storage in GB and operation counts. If capped, displays a red alert badge: `[ R2 Free Limit Reached - Media Capped ]`.
2. Left pane (Conversation List):
   * Search filter by customer name, phone number, or customer ID.
   * Conversation item showing name, assigned customer ID (`cust_...`), last message snippet, timestamp, and a Customer Service Window status pill.
   * Status pill: Green countdown (e.g. `Free Reply: 18h left`), or Grey badge (`24h Window Closed`).
3. Center pane (Chat Conversation):
   * Chat bubbles separated by direction (inbound vs outbound).
   * Delivery status badges on outbound messages: Accepted, Delivered, Read, Failed.
   * Error cards: If a message fails because the 24-hour window expired, daily tier limit was reached, or R2 storage capped, display the exact failure reason and allow the user to see and send it manually.
   * R2 media players: Audio player for voice notes, image viewer for photos, and download buttons for documents and PDFs.
   * Capped media card: If media download was skipped due to R2 quota, render an inline notice: `[Media Skipped - Free Limit Reached (9.0 GB)] - Text and conversation context preserved.`
4. Composer pane:
   * Text input and send button.
   * If the window is closed, disable the free text field and show an actionable alert: "24-hour service window expired. Use WhatsApp mobile app or send an approved template."

---

## 7. Subagent Testability Engine (`window.site`)

To allow AI subagents to inspect, navigate, and test the UI without screenshot tokens or DOM parsing overhead, the client exposes a global TypeScript testing API on `window.site`.

### Interface Definition

```typescript
declare global {
  interface Window {
    site: {
      isReady: () => boolean;
      getState: () => {
        route: string;
        activeCustomerWaId: string | null;
        customerCount: number;
        messageCount: number;
        freeMonthlyRemaining: number;
        dailyRemaining: number;
        cswActive: boolean;
        cswRemainingMinutes: number;
        r2Usage: {
          storageBytes: number;
          storageUsagePercent: number;
          classAOps: number;
          classBOps: number;
          isCapped: boolean;
          activeCapReason: string | null;
        };
      };
      getAsciiDiagram: () => string;
      getClickables: () => Array<{
        id: string;
        label: string;
        selector: string;
        disabled: boolean;
        cswState?: string;
      }>;
      selectCustomer: (waId: string) => Promise<boolean>;
      sendMessage: (text: string) => Promise<{ success: boolean; error?: string }>;
    };
  }
}
```

### ASCII Output Example

```
+-----------------------------------------------------------------------------------------+
| [Header] Phone: +91 91766 50591 | Monthly Free: 999/1000 | Daily: 1/250 | Bal: $0.50     |
| [R2 Status] Storage: 0.12 GB / 9.00 GB | Class A: 4 / 900,000 | State: HEALTHY          |
+-----------------------------------------------------------------------------------------+
| CONVERSATIONS                       | CHAT: Santhosh M K (+91 79041 27446) [ID: cust_01] |
| [#conv-917904127446] Santhosh M K   | [10:34] Customer: Hi                              |
|   Last: Hi (10:34)                  | [10:34] Business: Hi Santhosh! [Status: Delivered] |
|   Window: [23h 45m left] (ACTIVE)   | Window: Free reply active (23h 45m remaining)     |
|                                     | Media: [R2 Audio: voice_note.ogg (120 KB)]        |
|                                     |---------------------------------------------------|
|                                     | [#input-msg] [ Type message...                  ] |
|                                     | [#btn-send] [ Send Message ]                      |
+-----------------------------------------------------------------------------------------+
```

---

## 8. Subagent Execution Plan

The implementation executes across four sequential groups. Tasks inside each group run in parallel subagents.

### Group 1: Infrastructure, D1 Schema, and R2 Zero-Billing Guard (Sequential Group 1)
* Task 1.1: Initialize Cloudflare Worker project with TypeScript, Wrangler, and Hono routing.
* Task 1.2: Write D1 migration schema (`schema.sql`) for customers, messages, quota counters, and R2 usage tracking.
* Task 1.3: Configure R2 bucket binding (`MEDIA_BUCKET`) in `wrangler.jsonc`.
* Task 1.4: Implement `R2ZeroBillingGuard` service enforcing the 9.0 GB and 900k operations ceiling.
* Completion criterion: Project builds cleanly with Wrangler; D1 migrations and R2 bindings pass local validation.

### Group 2: Webhook Engine and YCloud API Integration (Sequential Group 2)
* Task 2.1: Implement `POST /webhook` and `GET /webhook` handlers for Meta and YCloud events.
* Task 2.2: Implement media interception with R2 zero-billing pre-check: store stream in R2 when under ceiling; mark status `'media_capped_free_limit'` when capped.
* Task 2.3: Implement message deduplication via `wamid` and Customer Service Window computation (24h organic vs 72h ad referral).
* Task 2.4: Implement `POST /api/send`, `POST /api/upload` (returns 507 when capped), and `GET /api/media/:key` endpoints.
* Completion criterion: Inbound payloads simulate via curl; database records customers and messages with correct CSW timestamps and R2 keys.

### Group 3: Dashboard Frontend and `window.site` Testability Engine (Sequential Group 3)
* Task 3.1: Build the responsive Single Page Application with conversation lists, chat history, media players, quota headers, and R2 cap alert banners.
* Task 3.2: Implement the `window.site` testing interface with ASCII wireframe generator and interactive element catalog.
* Completion criterion: Frontend compiles into `./dist`; `window.site.isReady()` returns true when rendered.

### Group 4: End-to-End Subagent Verification (Sequential Group 4)
* Task 4.1: Subagents run curl verification against all API routes (`/webhook`, `/api/conversations`, `/api/messages`, `/api/media/:key`, `/api/stats`, `/api/upload`). Test simulated capped storage to verify HTTP 507 response.
* Task 4.2: Subagent opens the dashboard via OpenChamber browser tool, inspects the ASCII layout via `window.site.getAsciiDiagram()`, tests navigation, verifies message statuses, checks R2 media rendering, and confirms window indicators.
* Completion criterion: All API endpoints return expected data; browser verification completes without console errors.
