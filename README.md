# WhatsApp Cloudflare dashboard

## Purpose
WhatsApp Cloudflare dashboard is an edge messaging system and operator console running on Cloudflare Workers, Cloudflare D1, and Cloudflare R2. The application receives WhatsApp webhooks, enforces Meta customer service window rules, saves inbound media, and delivers real-time operator chat.

Primary search terms and topics include WhatsApp Cloudflare dashboard, webhooks, worker management, edge messaging, Cloudflare Workers, D1 database, R2 object storage, Hono web framework, YCloud WhatsApp API, Meta Cloud API, customer service window, and serverless WhatsApp webhook.

The dashboard manages operator workflows under Cloudflare free tier limits:
- 100,000 requests per day for Cloudflare Workers.
- 5,000,000 reads and 100,000 writes per day for Cloudflare D1.
- 9.0 GB storage cap in Cloudflare R2, keeping a 1.0 GB margin under the 10 GB free tier.
- 900,000 Class A operations per month in R2.
- 24-hour response window for organic customer messages.
- 72-hour response window for Meta ad referral conversations.

## Architecture
The system consists of three functional layers:

1. Edge API worker. Built with Hono on Cloudflare Workers using TypeScript. It accepts inbound webhooks from Meta Cloud API and YCloud, validates cryptographic signatures, checks customer service windows, runs zero-billing storage guards, and routes admin API requests.
2. Persistence layer. Cloudflare D1 SQLite database stores relational records and vector embeddings. Cloudflare R2 object storage stores inbound and outbound media files such as images, voice notes, and PDFs.
3. Dashboard client. Single-page application written in HTML5, CSS3, and JavaScript delivered by Cloudflare Workers Static Assets. It provides conversation threads, contact search, broadcast messaging, message forwarding, PDF inspection, and waitlist management.

### Component data flow
- Inbound webhooks. Meta or YCloud sends POST requests to `/webhook`. The worker updates the customer record, checks customer service window timers, evaluates R2 safety thresholds, stores media files in R2, and saves message records in D1.
- Outbound messages. The operator enters a message or selects a template in the dashboard. The client sends a POST request to `/api/send`. The worker checks if the 24-hour customer service window is open, then dispatches the message via YCloud WhatsApp API.
- Static assets. Cloudflare Worker Static Assets delivers pre-built UI files from the `dist/` directory with single-page application fallback routing.
- Media storage guard. The worker tracks R2 storage volume and monthly Class A operations in D1. If storage reaches 9.0 GB or Class A operations reach 900,000, the worker skips media downloads and records messages with status `media_capped_free_limit`.

## Setup

### Prerequisites
- Node.js 20 or later.
- Cloudflare account with Workers, D1, and R2 enabled.
- Cloudflare Wrangler CLI.
- YCloud account with an active WhatsApp Business number, or Meta Cloud API account.

### Local installation
1. Clone the repository:
```bash
git clone https://github.com/devsanthoshmk/whatsapp-cloudflare-dashboard.git
cd whatsapp-cloudflare-dashboard
```

2. Install dependencies:
```bash
npm install
```

3. Prepare the local environment file:
```bash
cp .env.example .dev.vars
```
Set the required values in `.dev.vars`:
```ini
PHONE_NUMBER_ID=1443763802148612
WABA_ID=1372244598006760
YCLOUD_API_KEY=your_ycloud_api_key
WEBHOOK_VERIFY_TOKEN=your_custom_verification_token
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=your_secure_password
AUTH_SECRET=your_32_character_random_hex_secret_string
```

4. Initialize the local D1 database schema:
```bash
npx wrangler d1 execute DB --local --file=schema.sql
```

5. Start the local development server:
```bash
npx wrangler dev
```
Open `http://localhost:8787` in your browser.

### Cloudflare deployment
1. Create the remote Cloudflare D1 database:
```bash
npx wrangler d1 create whatsapp-db
```
Copy the database ID from the command output into `wrangler.jsonc` under `d1_databases[0].database_id`.

2. Apply the database schema to the remote database:
```bash
npx wrangler d1 execute DB --remote --file=schema.sql
```

3. Create the remote Cloudflare R2 media buckets:
```bash
npx wrangler r2 bucket create whatsapp-media
npx wrangler r2 bucket create whatsapp-media-dev
```

4. Set production secrets in Cloudflare Workers:
```bash
npx wrangler secret put YCLOUD_API_KEY
npx wrangler secret put WEBHOOK_VERIFY_TOKEN
npx wrangler secret put ADMIN_EMAIL
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put AUTH_SECRET
```

5. Deploy the worker and dashboard:
```bash
npx wrangler deploy
```

6. Configure the webhook in Meta or YCloud:
Set the webhook callback URL to `https://<your-worker-subdomain>.workers.dev/webhook` and enter your configured `WEBHOOK_VERIFY_TOKEN`. Subscribe to the `messages` event.

## Usage

### Operator dashboard
- Conversations list. Displays all customer chats sorted by last interaction time. Status pills indicate whether the customer service window is open or expired.
- Chat timeline. Displays chronological message history with delivery statuses (sent, delivered, read) and media thumbnails.
- Reply composer. Accepts text input, quick AYUSH product templates, and file attachments up to 16 MB.
- Broadcast multi-send. Opens a dialog to pick multiple customer numbers and dispatch messages with window verification.
- Forwarding. Forwards existing customer messages and media attachments to other registered contacts.
- PDF viewer. Opens document attachments in a modal overlay.
- Waitlist portal. Lists new sign-in attempts and allows administrators to approve, reject, or archive access.

### Standalone Node.js server
The repository includes `server.mjs`, a fallback HTTP server for testing webhook receipts locally without Wrangler:
```bash
cp .env.example .env
npm run dev
```
The server listens on port 3000 and writes received payloads to `messages.json` and `messages.log`.

## Configuration

### Environment variables and secrets
The application reads settings from `wrangler.jsonc` variables and Cloudflare worker secrets.

| Name | Type | Target | Description |
|---|---|---|---|
| PHONE_NUMBER_ID | Variable | wrangler.jsonc | Meta WhatsApp phone number ID |
| WABA_ID | Variable | wrangler.jsonc | Meta WhatsApp Business Account ID |
| YCLOUD_API_KEY | Secret | Worker secret | API key for YCloud WhatsApp message delivery |
| WEBHOOK_VERIFY_TOKEN | Secret | Worker secret | Shared token to verify Meta webhook subscriptions |
| ADMIN_EMAIL | Secret | Worker secret | Primary administrator email address |
| ADMIN_PASSWORD | Secret | Worker secret | Primary administrator dashboard password |
| AUTH_SECRET | Secret | Worker secret | Minimum 32-character HMAC key for cookie session signing |
| R2_PUBLIC_URL | Variable | Worker secret | Optional public CDN URL for media objects |

### Database tables
The SQLite schema in `schema.sql` defines 8 tables:
- `customers`. Stores phone numbers, display names, customer service window expiry timestamps, and referral sources.
- `messages`. Stores incoming and outgoing messages, message types, R2 keys, statuses, and delivery timestamps.
- `usage_counters`. Tracks daily and monthly message volumes against free quotas.
- `r2_usage`. Tracks cumulative R2 byte count and Class A operations to enforce zero-billing limits.
- `waitlist`. Stores login access requests with statuses of pending, approved, rejected, or archived.
- `chat_embeddings`. Stores text vector embeddings for customer history RAG queries.
- `product_catalog`. Stores AYUSH product SKUs, classical names, HSN codes, and 5% or 12% GST rates.
- `billing_records`. Stores calculated invoices, tax splits, line items, and payment links.

### API endpoints
- `GET /webhook`. Meta webhook verification handshake.
- `POST /webhook`. Inbound webhook receiver for Meta and YCloud events.
- `POST /api/auth/login`. Administrator login and waitlist registration.
- `POST /api/auth/logout`. Clears the session cookie.
- `GET /api/auth/check`. Validates session authentication state.
- `GET /api/conversations`. Lists conversations with customer service window timers.
- `GET /api/messages/:wa_id`. Returns full message history for a phone number.
- `POST /api/send`. Sends a message to a customer within an open window.
- `POST /api/send-batch`. Broadcasts a message to multiple customer contacts.
- `POST /api/messages/forward`. Forwards a message to another contact.
- `POST /api/upload`. Uploads a media file directly to R2.
- `GET /api/stats`. Returns current usage counts and R2 storage statistics.
- `GET /api/ai/tools`. Returns definitions for all 11 AI functions.
- `POST /api/ai/tools/execute`. Executes a registered AI tool call.
- `POST /api/billing/calculate`. Calculates AYUSH tax rates and invoice totals.
