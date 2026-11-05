import type { Context } from 'hono';
import type { Env, Customer, Message } from '../types';
import { R2ZeroBillingGuard } from '../services/r2-guard';

interface ParsedInbound {
  wamid: string;
  customerWaId: string;
  customerName: string | null;
  messageType: string;
  textBody: string | null;
  media: {
    url: string;
    mimeType: string;
    filename?: string;
  } | null;
  timestamp: number;
  isAdReferral: boolean;
  rawPayload: string;
}

/**
 * Handle Webhook GET verification (Meta Challenge Handshake)
 */
export async function handleWebhookVerification(c: Context<{ Bindings: Env }>) {
  const mode = c.req.query('hub.mode');
  const token = c.req.query('hub.verify_token');
  const challenge = c.req.query('hub.challenge');

  const expectedToken = c.env.WEBHOOK_VERIFY_TOKEN;

  if (mode === 'subscribe' && expectedToken && token === expectedToken) {
    return c.text(challenge || '', 200);
  }

  return c.text('Forbidden: Invalid verification token', 403);
}

/**
 * Parse incoming webhook payload from Meta Cloud API or YCloud
 */
function parseWebhookEvent(payload: any): ParsedInbound | null {
  try {
    const rawPayload = JSON.stringify(payload);

    // Format 1: YCloud Event (whatsapp.inbound_message.received)
    if (payload.type === 'whatsapp.inbound_message.received' && payload.whatsappInboundMessage) {
      const msg = payload.whatsappInboundMessage;
      const wamid = msg.wamid || msg.id;
      const from = msg.from.replace(/\+/g, '');
      const name = msg.customerProfile?.name || null;
      const type = msg.type || 'text';
      const sendTime = msg.sendTime ? Math.floor(new Date(msg.sendTime).getTime() / 1000) : Math.floor(Date.now() / 1000);
      const isAd = Boolean(msg.referral);

      let media: ParsedInbound['media'] = null;
      let textBody: string | null = null;

      if (type === 'text') {
        textBody = msg.text?.body || '';
      } else if (msg[type] && typeof msg[type] === 'object') {
        const m = msg[type];
        media = {
          url: m.link || m.url || '',
          mimeType: m.mime_type || 'application/octet-stream',
          filename: m.filename,
        };
        textBody = m.caption || null;
      }

      return {
        wamid,
        customerWaId: from,
        customerName: name,
        messageType: type,
        textBody,
        media,
        timestamp: sendTime,
        isAdReferral: isAd,
        rawPayload,
      };
    }

    // Format 2: Meta Cloud API Event
    const entry = payload?.entry?.[0]?.changes?.[0]?.value;
    if (entry && Array.isArray(entry.messages) && entry.messages.length > 0) {
      const msg = entry.messages[0];
      const from = msg.from.replace(/\+/g, '');
      const wamid = msg.id;
      const type = msg.type || 'text';
      const timestamp = msg.timestamp ? Number(msg.timestamp) : Math.floor(Date.now() / 1000);
      const isAd = Boolean(msg.referral);

      let customerName: string | null = null;
      if (Array.isArray(entry.contacts) && entry.contacts.length > 0) {
        customerName = entry.contacts[0].profile?.name || null;
      }

      let media: ParsedInbound['media'] = null;
      let textBody: string | null = null;

      if (type === 'text') {
        textBody = msg.text?.body || '';
      } else if (msg[type] && typeof msg[type] === 'object') {
        const m = msg[type];
        media = {
          url: m.link || m.url || '',
          mimeType: m.mime_type || 'application/octet-stream',
          filename: m.filename,
        };
        textBody = m.caption || null;
      }

      return {
        wamid,
        customerWaId: from,
        customerName,
        messageType: type,
        textBody,
        media,
        timestamp,
        isAdReferral: isAd,
        rawPayload,
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Handle incoming Webhook POST (Meta and YCloud)
 */
export async function handleWebhookPost(c: Context<{ Bindings: Env }>) {
  const db = c.env.DB;
  const bucket = c.env.MEDIA_BUCKET;
  const now = Math.floor(Date.now() / 1000);

  let payload: any;
  try {
    payload = await c.req.json();
  } catch {
    return c.text('Invalid JSON', 400);
  }

  // Handle Delivery Status Updates (Meta and YCloud)
  if (
    payload.type === 'whatsapp.message.updated' ||
    payload?.entry?.[0]?.changes?.[0]?.value?.statuses
  ) {
    const statusObj = payload.whatsappMessage || payload.entry[0].changes[0].value.statuses[0];
    if (statusObj) {
      const wamid = statusObj.wamid || statusObj.id;
      const status = statusObj.status; // sent, delivered, read, failed
      const err = statusObj.errors?.[0];

      if (wamid && status) {
        await db.prepare(`
          UPDATE messages 
          SET status = ?1, error_code = ?2, error_message = ?3 
          WHERE id = ?4
        `).bind(status, err?.code || null, err?.title || err?.message || null, wamid).run();
      }
    }
    return c.json({ status: 'ok', handled: 'status' }, 200);
  }

  // Parse Inbound Message
  const event = parseWebhookEvent(payload);
  if (!event) {
    return c.json({ status: 'ignored', reason: 'non_message_event' }, 200);
  }

  // 1. Calculate Customer Service Window: 72 hours for ad referral, 24 hours for organic
  const windowDuration = event.isAdReferral ? 72 * 3600 : 24 * 3600;
  const cswExpiresAt = event.timestamp + windowDuration;
  const cswSource = event.isAdReferral ? 'ad' : 'organic';
  const customerId = `cust_${event.customerWaId}`;

  // 2. Upsert Customer in D1
  await db.prepare(`
    INSERT INTO customers (
      id, wa_id, phone_number, name, 
      last_inbound_at, csw_expires_at, csw_source, 
      total_messages_count, created_at, updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8, ?8)
    ON CONFLICT(wa_id) DO UPDATE SET
      name = COALESCE(excluded.name, customers.name),
      last_inbound_at = excluded.last_inbound_at,
      csw_expires_at = excluded.csw_expires_at,
      csw_source = excluded.csw_source,
      total_messages_count = customers.total_messages_count + 1,
      updated_at = excluded.updated_at
  `).bind(
    customerId,
    event.customerWaId,
    `+${event.customerWaId}`,
    event.customerName,
    event.timestamp,
    cswExpiresAt,
    cswSource,
    now
  ).run();

  // 3. Handle Message & Media
  if (!event.media || !event.media.url) {
    // Pure text message
    await db.prepare(`
      INSERT OR IGNORE INTO messages (
        id, customer_wa_id, direction, type, body, 
        status, raw_payload, created_at
      ) VALUES (?1, ?2, 'inbound', ?3, ?4, 'received', ?5, ?6)
    `).bind(
      event.wamid,
      event.customerWaId,
      event.messageType,
      event.textBody || '',
      event.rawPayload,
      event.timestamp
    ).run();

    return c.json({ status: 'ok', media: false }, 200);
  }

  // Media message: Voice note, image, document, video
  const estimatedBytes = 2 * 1024 * 1024; // 2 MB estimate for pre-check
  const preCheck = await R2ZeroBillingGuard.preCheckPut(db, estimatedBytes);

  if (!preCheck.allowed) {
    // R2 CEILING MET: Zero billing guarantee activated
    const notice = event.textBody 
      ? `${event.textBody} [Media download skipped: R2 free limit reached]`
      : `[${event.media.mimeType} skipped: R2 free limit reached]`;

    await db.prepare(`
      INSERT OR IGNORE INTO messages (
        id, customer_wa_id, direction, type, body,
        media_r2_key, media_url, media_mime, media_filename, media_size,
        status, error_message, raw_payload, created_at
      ) VALUES (?1, ?2, 'inbound', ?3, ?4, NULL, NULL, ?5, ?6, 0, 'media_capped_free_limit', ?7, ?8, ?9)
    `).bind(
      event.wamid,
      event.customerWaId,
      event.messageType,
      notice,
      event.media.mimeType,
      event.media.filename || null,
      `Ceiling reached: ${preCheck.reason}. Storage capped to guarantee zero billing.`,
      event.rawPayload,
      event.timestamp
    ).run();

    return c.json({ status: 'ok', media_status: 'media_capped_free_limit' }, 200);
  }

  // Pre-check passed: Stream media from upstream into R2
  try {
    const upstreamRes = await fetch(event.media.url, {
      headers: {
        'User-Agent': 'Cloudflare-Worker-WhatsApp-Bot',
        ...(c.env.YCLOUD_API_KEY ? { 'X-API-Key': c.env.YCLOUD_API_KEY } : {})
      }
    });

    if (!upstreamRes.ok || !upstreamRes.body) {
      throw new Error(`Upstream returned ${upstreamRes.status}`);
    }

    const buffer = await upstreamRes.arrayBuffer();
    const actualSize = buffer.byteLength;
    const cleanFilename = event.media.filename ? event.media.filename.replace(/[^a-zA-Z0-9._-]/g, '_') : 'file';
    const r2Key = `media/${event.customerWaId}/${event.timestamp}_${cleanFilename}`;

    await bucket.put(r2Key, buffer, {
      httpMetadata: {
        contentType: event.media.mimeType,
        contentDisposition: `inline; filename="${cleanFilename}"`,
        cacheControl: 'public, max-age=31536000, s-maxage=31536000, immutable'
      }
    });

    // Record message & update R2 usage counters atomically in D1 batch
    const insertMsgStmt = db.prepare(`
      INSERT OR IGNORE INTO messages (
        id, customer_wa_id, direction, type, body,
        media_r2_key, media_url, media_mime, media_filename, media_size,
        status, raw_payload, created_at
      ) VALUES (?1, ?2, 'inbound', ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'received', ?10, ?11)
    `).bind(
      event.wamid,
      event.customerWaId,
      event.messageType,
      event.textBody || null,
      r2Key,
      `/api/media/${encodeURIComponent(r2Key)}`,
      event.media.mimeType,
      event.media.filename || null,
      actualSize,
      event.rawPayload,
      event.timestamp
    );

    const [stmtStorage, stmtOps] = R2ZeroBillingGuard.getRecordPutStatements(db, actualSize, now);
    await db.batch([insertMsgStmt, stmtStorage, stmtOps]);

    return c.json({ status: 'ok', media_status: 'stored', r2Key }, 200);
  } catch (err: any) {
    // Record inbound message even if upstream media download failed
    await db.prepare(`
      INSERT OR IGNORE INTO messages (
        id, customer_wa_id, direction, type, body,
        status, error_message, raw_payload, created_at
      ) VALUES (?1, ?2, 'inbound', ?3, ?4, 'failed', ?5, ?6, ?7)
    `).bind(
      event.wamid,
      event.customerWaId,
      event.messageType,
      event.textBody || '[Media download failed]',
      err.message || 'Media fetch failed',
      event.rawPayload,
      event.timestamp
    ).run();

    return c.json({ status: 'ok', media_status: 'failed', error: err.message }, 200);
  }
}
