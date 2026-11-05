import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to load .env file if present
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim();
          if (key && !(key in process.env)) {
            process.env[key] = val;
          }
        }
      }
    } catch (e) {
      console.warn('Could not read .env file:', e.message);
    }
  }
}
loadEnv();

// Configuration
const PORT = parseInt(process.env.PORT || '3000', 10);
const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || '';
const GRAPH_API_TOKEN = process.env.GRAPH_API_TOKEN || process.env.ACCESS_TOKEN || '';
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID || '1230781583454210';
const GRAPH_API_VERSION = process.env.GRAPH_API_VERSION || 'v21.0';

const MESSAGES_JSON_FILE = path.join(__dirname, 'messages.json');
const MESSAGES_LOG_FILE = path.join(__dirname, 'messages.log');

// Initialize messages.json if not present
if (!fs.existsSync(MESSAGES_JSON_FILE)) {
  fs.writeFileSync(MESSAGES_JSON_FILE, JSON.stringify([], null, 2), 'utf8');
}

/**
 * Save received message to messages.json and messages.log
 */
function recordMessage(record) {
  // Append to messages.log
  const logEntry = `[${new Date().toISOString()}] FROM: ${record.from} (${record.senderName || 'Unknown'}) | ID: ${record.id} | TEXT: "${record.text || record.type || ''}"\n`;
  try {
    fs.appendFileSync(MESSAGES_LOG_FILE, logEntry, 'utf8');
  } catch (err) {
    console.error('Failed to write to messages.log:', err);
  }

  // Append to messages.json
  try {
    let list = [];
    if (fs.existsSync(MESSAGES_JSON_FILE)) {
      const raw = fs.readFileSync(MESSAGES_JSON_FILE, 'utf8');
      try {
        list = JSON.parse(raw);
        if (!Array.isArray(list)) list = [];
      } catch {
        list = [];
      }
    }
    list.push(record);
    fs.writeFileSync(MESSAGES_JSON_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to update messages.json:', err);
  }
}

/**
 * Send WhatsApp text message using Meta Graph API
 */
async function sendWhatsAppReply(to, textBody, originalMessageId) {
  const token = process.env.GRAPH_API_TOKEN || process.env.ACCESS_TOKEN || GRAPH_API_TOKEN;
  if (!token) {
    console.log(`[WHATSAPP REPLY] GRAPH_API_TOKEN not set in environment or .env. Automated direct reply skipped for ${to}.`);
    return;
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${PHONE_NUMBER_ID}/messages`;
  const replyBody = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
    type: 'text',
    text: {
      preview_url: false,
      body: `[Automated Response] Hello! Received your message: "${textBody || 'attachment'}".`
    }
  };

  try {
    console.log(`[WHATSAPP REPLY] Sending reply to ${to} via ${url}...`);
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(replyBody)
    });

    const result = await resp.json();
    if (resp.ok) {
      console.log(`[WHATSAPP REPLY SUCCESS] Sent reply to ${to}:`, JSON.stringify(result));
    } else {
      console.error(`[WHATSAPP REPLY ERROR] Meta Graph API returned ${resp.status}:`, JSON.stringify(result));
    }
  } catch (err) {
    console.error(`[WHATSAPP REPLY FAILED] Network error sending reply to ${to}:`, err.message);
  }
}

/**
 * Process WhatsApp Cloud API incoming payload
 */
async function processWebhookPayload(payload) {
  if (payload.object !== 'whatsapp_business_account' && !payload.entry) {
    console.log('[WHATSAPP WEBHOOK] Received non-WhatsApp payload:', JSON.stringify(payload).slice(0, 150));
    return;
  }

  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value;
      if (!value) continue;

      // Extract contact profiles
      const contactsMap = {};
      if (Array.isArray(value.contacts)) {
        for (const contact of value.contacts) {
          if (contact.wa_id) {
            contactsMap[contact.wa_id] = contact.profile?.name || '';
          }
        }
      }

      // Handle incoming messages
      if (Array.isArray(value.messages)) {
        for (const msg of value.messages) {
          const from = msg.from;
          const msgId = msg.id;
          const timestamp = msg.timestamp ? new Date(Number(msg.timestamp) * 1000).toISOString() : new Date().toISOString();
          const type = msg.type;
          let textBody = '';

          if (type === 'text' && msg.text) {
            textBody = msg.text.body;
          } else if (msg[type] && typeof msg[type] === 'object') {
            textBody = `[${type.toUpperCase()}: ${msg[type].caption || msg[type].filename || msg[type].id || ''}]`;
          } else {
            textBody = `[Type: ${type}]`;
          }

          const senderName = contactsMap[from] || '';

          console.log('\n=================== WHATSAPP INCOMING MESSAGE ===================');
          console.log(`From:       ${senderName ? `${senderName} (${from})` : from}`);
          console.log(`Message ID: ${msgId}`);
          console.log(`Timestamp:  ${timestamp}`);
          console.log(`Type:       ${type}`);
          console.log(`Content:    ${textBody}`);
          console.log('=================================================================\n');

          const record = {
            id: msgId,
            from,
            senderName,
            timestamp,
            type,
            text: textBody,
            rawMessage: msg,
            receivedAt: new Date().toISOString()
          };

          recordMessage(record);

          // Trigger reply logic asynchronously
          sendWhatsAppReply(from, textBody, msgId).catch(err => {
            console.error('Unhandled error in sendWhatsAppReply:', err);
          });
        }
      }

      // Handle message statuses (sent, delivered, read, failed)
      if (Array.isArray(value.statuses)) {
        for (const status of value.statuses) {
          console.log(`[WHATSAPP STATUS] Message ${status.id} to ${status.recipient_id} status: ${status.status} (${status.timestamp ? new Date(Number(status.timestamp) * 1000).toISOString() : ''})`);
        }
      }
    }
  }
}

// Create HTTP server
const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = reqUrl.pathname;

  // GET /webhook: Verification challenge from Meta
  if (req.method === 'GET' && pathname === '/webhook') {
    const mode = reqUrl.searchParams.get('hub.mode');
    const token = reqUrl.searchParams.get('hub.verify_token');
    const challenge = reqUrl.searchParams.get('hub.challenge');

    console.log(`[VERIFY REQUEST] mode: ${mode}, token: ${token}, challenge: ${challenge}`);

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('>>> [VERIFY SUCCESS] Webhook challenge verified successfully.');
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(challenge);
    } else {
      console.warn(`>>> [VERIFY FAILED] Invalid token or mode. Expected token: ${VERIFY_TOKEN}`);
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden: verification token mismatch');
    }
    return;
  }

  // POST /webhook: Incoming notifications from Meta
  if (req.method === 'POST' && pathname === '/webhook') {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });

    req.on('end', () => {
      // Immediate 200 OK response to Meta
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'EVENT_RECEIVED' }));

      // Parse payload asynchronously
      try {
        if (body) {
          const parsed = JSON.parse(body);
          processWebhookPayload(parsed).catch(err => {
            console.error('[PAYLOAD ERROR] Failed processing payload:', err);
          });
        }
      } catch (err) {
        console.error('[JSON PARSE ERROR] Malformed webhook body:', err.message);
      }
    });
    return;
  }

  // GET /health
  if (req.method === 'GET' && pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // GET /messages
  if (req.method === 'GET' && pathname === '/messages') {
    try {
      const data = fs.existsSync(MESSAGES_JSON_FILE)
        ? fs.readFileSync(MESSAGES_JSON_FILE, 'utf8')
        : '[]';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(data);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // GET /: Dashboard & info
  if (req.method === 'GET' && pathname === '/') {
    let messageCount = 0;
    try {
      if (fs.existsSync(MESSAGES_JSON_FILE)) {
        const list = JSON.parse(fs.readFileSync(MESSAGES_JSON_FILE, 'utf8'));
        messageCount = Array.isArray(list) ? list.length : 0;
      }
    } catch {}

    const tokenConfigured = Boolean(process.env.GRAPH_API_TOKEN || GRAPH_API_TOKEN);

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>WhatsApp Webhook Server</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 700px; margin: 40px auto; padding: 0 20px; color: #222; }
    h1 { color: #25D366; }
    .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-weight: bold; }
    .online { background: #e6f9ed; color: #128c7e; }
    .box { background: #f8f9fa; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0; }
    pre { background: #1e1e1e; color: #d4d4d4; padding: 12px; border-radius: 6px; overflow-x: auto; }
  </style>
</head>
<body>
  <h1>WhatsApp Cloud API Webhook Server</h1>
  <p><span class="badge online">ONLINE</span> Port: <strong>${PORT}</strong></p>
  <div class="box">
    <h3>Configuration Details</h3>
    <ul>
      <li><strong>Webhook Path:</strong> <code>/webhook</code></li>
      <li><strong>Verify Token:</strong> <code>${VERIFY_TOKEN}</code></li>
      <li><strong>Phone Number ID:</strong> <code>${PHONE_NUMBER_ID}</code></li>
      <li><strong>Direct Reply Token:</strong> ${tokenConfigured ? '<span style="color:green;">Configured</span>' : '<span style="color:#e67e22;">Not set (logs only)</span>'}</li>
      <li><strong>Recorded Messages:</strong> <strong>${messageCount}</strong> (<a href="/messages">View JSON</a>)</li>
    </ul>
  </div>
</body>
</html>`);
    return;
  }

  // 404 for other routes
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`WhatsApp Webhook Server running at http://localhost:${PORT}`);
  console.log(`Webhook endpoint:       http://localhost:${PORT}/webhook`);
  console.log(`Verify Token:           ${VERIFY_TOKEN}`);
  console.log(`Phone Number ID:        ${PHONE_NUMBER_ID}`);
  console.log(`Direct Reply Token:     ${GRAPH_API_TOKEN ? 'CONFIGURED' : 'NOT SET (Direct replies disabled)'}`);
  console.log(`Messages Log File:      ${MESSAGES_LOG_FILE}`);
  console.log(`Messages JSON Store:    ${MESSAGES_JSON_FILE}`);
  console.log(`=======================================================`);
});

// Process signal handling
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('SIGINT received, closing server...');
  server.close(() => process.exit(0));
});
