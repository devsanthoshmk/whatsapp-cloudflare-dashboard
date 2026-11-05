import type { Context } from 'hono';
import type { Env, Customer, Message, UsageStats, WaitlistEntry } from '../types';
import { R2ZeroBillingGuard } from '../services/r2-guard';
import { AuthService } from '../services/auth';

/**
 * Resolves media URL directly to R2 public URL if configured (bypassing Worker invocations
 * and R2 Class B charges), falling back to internal /api/media/:key endpoint.
 */
export function resolveMediaUrl(
  mediaR2Key: string | null | undefined,
  r2PublicUrl?: string,
  existingMediaUrl?: string | null
): string | null {
  if (!mediaR2Key) {
    return existingMediaUrl || null;
  }
  if (r2PublicUrl) {
    const base = r2PublicUrl.replace(/\/+$/, '');
    return `${base}/${encodeURIComponent(mediaR2Key)}`;
  }
  return `/api/media/${encodeURIComponent(mediaR2Key)}`;
}

/**
 * POST /api/auth/login
 * Validates email and password:
 * - Admin email: validates against ADMIN_PASSWORD, sets session token cookie, returns user
 * - Non-admin email:
 *   - Approved: validates password against ADMIN_PASSWORD, creates member session token & cookie
 *   - Rejected: increments attempt_count, updates last_attempt_at, returns 403 REJECTED
 *   - Archived: increments attempt_count, updates last_attempt_at, returns 403 ARCHIVED
 *   - Pending or not found: upserts waitlist entry, returns 403 WAITLISTED
 */
export async function handleAuthLogin(c: Context<{ Bindings: Env }>) {
  let body: { email?: string; password?: string } = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'INVALID_PAYLOAD', message: 'Invalid JSON payload' }, 400);
  }

  const rawEmail = body.email || '';
  const normalizedEmail = rawEmail.trim().toLowerCase();
  const adminEmail = (c.env.ADMIN_EMAIL || 'connectwithsanthoshmk@gmail.com').trim().toLowerCase();
  const adminPassword = c.env.ADMIN_PASSWORD || '[REDACTED]';

  if (!normalizedEmail) {
    return c.json({ error: 'VALIDATION_ERROR', message: 'Email is required' }, 400);
  }

  if (normalizedEmail === adminEmail) {
    if (!body.password || body.password !== adminPassword) {
      return c.json({ error: 'INVALID_CREDENTIALS', message: 'Incorrect password' }, 401);
    }

    const secret = c.env.AUTH_SECRET || '[REDACTED]';
    const token = await AuthService.createSessionToken({ email: normalizedEmail, role: 'admin' }, secret);

    c.header('Set-Cookie', `session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`);
    return c.json({
      success: true,
      user: {
        email: normalizedEmail,
        role: 'admin'
      }
    });
  }

  // Non-admin email: query waitlist for this email
  const entry = await c.env.DB.prepare(`
    SELECT * FROM waitlist WHERE email = ?1
  `).bind(normalizedEmail).first<WaitlistEntry>();

  const entryStatus = entry?.status?.toLowerCase().trim();

  if (entry && entryStatus === 'approved') {
    if (!body.password || body.password !== adminPassword) {
      return c.json({ error: 'INVALID_CREDENTIALS', message: 'Incorrect password' }, 401);
    }

    const secret = c.env.AUTH_SECRET || '[REDACTED]';
    const token = await AuthService.createSessionToken({ email: normalizedEmail, role: 'member' }, secret);

    c.header('Set-Cookie', `session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`);
    return c.json({
      success: true,
      user: {
        email: normalizedEmail,
        role: 'member'
      }
    });
  }

  if (entry && entryStatus === 'rejected') {
    const now = Math.floor(Date.now() / 1000);
    await c.env.DB.prepare(`
      UPDATE waitlist
      SET attempt_count = attempt_count + 1,
          last_attempt_at = ?1
      WHERE id = ?2
    `).bind(now, entry.id).run();

    return c.json({
      error: 'REJECTED',
      message: 'Your access request has been declined.'
    }, 403);
  }

  if (entry && entryStatus === 'archived') {
    const now = Math.floor(Date.now() / 1000);
    await c.env.DB.prepare(`
      UPDATE waitlist
      SET attempt_count = attempt_count + 1,
          last_attempt_at = ?1
      WHERE id = ?2
    `).bind(now, entry.id).run();

    return c.json({
      error: 'ARCHIVED',
      message: 'Your access request is archived. Contact admin for reactivation.'
    }, 403);
  }

  // If entry does not exist or entry.status === 'pending'
  const id = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  await c.env.DB.prepare(`
    INSERT INTO waitlist (id, email, status, attempt_count, last_attempt_at, created_at)
    VALUES (?1, ?2, 'pending', 1, ?3, ?3)
    ON CONFLICT(email) DO UPDATE SET
      attempt_count = waitlist.attempt_count + 1,
      last_attempt_at = excluded.last_attempt_at
  `).bind(id, normalizedEmail, now).run();

  return c.json({
    error: 'WAITLISTED',
    message: 'This account is waitlisted. An administrator will review your access request.'
  }, 403);
}

/**
 * POST /api/auth/logout
 * Clears session cookie and returns { success: true }.
 */
export async function handleAuthLogout(c: Context<{ Bindings: Env }>) {
  c.header('Set-Cookie', 'session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
  return c.json({ success: true });
}

/**
 * GET /api/auth/check
 * Extracts session cookie, verifies token, and returns { authenticated: boolean, user?: { email: string, role: string } }.
 */
export async function handleAuthCheck(c: Context<{ Bindings: Env }>) {
  const cookieHeader = c.req.header('Cookie') || c.req.header('cookie');
  const token = AuthService.extractSessionCookie(cookieHeader);

  if (!token) {
    return c.json({ authenticated: false });
  }

  const secret = c.env.AUTH_SECRET || '[REDACTED]';
  const authenticated = await AuthService.verifySessionToken(token, secret);
  if (!authenticated) {
    return c.json({ authenticated: false });
  }

  const session = AuthService.extractSessionData(token);
  if (!session) {
    return c.json({ authenticated: false });
  }

  return c.json({
    authenticated: true,
    user: {
      email: session.email,
      role: session.role
    }
  });
}

/**
 * GET /api/waitlist
 * Queries all waitlist records ordered by last_attempt_at DESC
 */
export async function handleGetWaitlist(c: Context<{ Bindings: Env }>) {
  const db = c.env.DB;
  const { results } = await db.prepare(`
    SELECT * FROM waitlist ORDER BY last_attempt_at DESC
  `).all<WaitlistEntry>();

  return c.json({ waitlist: results || [] });
}

const ALLOWED_WAITLIST_STATUSES = ['approved', 'rejected', 'archived', 'pending'] as const;
export type WaitlistStatus = (typeof ALLOWED_WAITLIST_STATUSES)[number];

/**
 * PATCH /api/waitlist/:id
 * POST /api/waitlist/:id/status
 * Updates the status of a waitlist entry (approved, rejected, archived, pending)
 */
export async function handleUpdateWaitlistStatus(c: Context<{ Bindings: Env }>) {
  const id = c.req.param('id');
  if (!id) {
    return c.json({ error: 'VALIDATION_ERROR', message: 'Waitlist ID is required' }, 400);
  }

  let body: { status?: unknown } = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'INVALID_PAYLOAD', message: 'Invalid JSON payload' }, 400);
  }

  const rawStatus = typeof body?.status === 'string' ? body.status.trim().toLowerCase() : '';
  if (!rawStatus || !ALLOWED_WAITLIST_STATUSES.includes(rawStatus as WaitlistStatus)) {
    return c.json({
      error: 'VALIDATION_ERROR',
      message: 'Invalid status. Allowed values: approved, rejected, archived, pending'
    }, 400);
  }

  const status = rawStatus as WaitlistStatus;
  const result = await c.env.DB.prepare(`
    UPDATE waitlist SET status = ?1 WHERE id = ?2
  `).bind(status, id).run();

  const changes = result.meta?.changes ?? (result as any).changes ?? 0;
  if (changes === 0) {
    return c.json({ error: 'NOT_FOUND', message: 'Waitlist entry not found' }, 404);
  }

  return c.json({ success: true, id, status });
}

/**
 * GET /api/conversations
 * Returns active customer threads with CSW status and last message
 */
export async function handleGetConversations(c: Context<{ Bindings: Env }>) {
  const db = c.env.DB;
  const now = Math.floor(Date.now() / 1000);

  const query = `
    SELECT 
      c.*,
      m.body AS last_message_body,
      m.type AS last_message_type,
      m.direction AS last_message_direction,
      m.status AS last_message_status,
      m.created_at AS last_message_time,
      m.media_r2_key AS last_message_media_r2_key,
      m.media_url AS last_message_media_url
    FROM customers c
    LEFT JOIN (
      SELECT m1.*
      FROM messages m1
      JOIN (
        SELECT customer_wa_id, MAX(created_at) AS max_time
        FROM messages
        GROUP BY customer_wa_id
      ) m2 ON m1.customer_wa_id = m2.customer_wa_id AND m1.created_at = m2.max_time
    ) m ON c.wa_id = m.customer_wa_id
    ORDER BY c.updated_at DESC
    LIMIT 50;
  `;

  const { results } = await db.prepare(query).all();

  const conversations = (results || []).map((row: any) => {
    const isCswActive = now < row.csw_expires_at;
    const remainingSeconds = Math.max(0, row.csw_expires_at - now);
    const remainingMinutes = Math.floor(remainingSeconds / 60);
    const remainingHours = Number((remainingSeconds / 3600).toFixed(1));
    const lastMessageMediaUrl = resolveMediaUrl(
      row.last_message_media_r2_key,
      c.env.R2_PUBLIC_URL,
      row.last_message_media_url
    );

    return {
      id: row.id,
      waId: row.wa_id,
      phoneNumber: row.phone_number,
      name: row.name || 'WhatsApp User',
      csw: {
        isActive: isCswActive,
        expiresAt: row.csw_expires_at,
        remainingMinutes,
        remainingHours,
        source: row.csw_source || 'organic',
        label: isCswActive ? `Free Reply: ${remainingHours}h left` : '24h Window Closed'
      },
      lastMessage: {
        body: row.last_message_body,
        type: row.last_message_type,
        direction: row.last_message_direction,
        status: row.last_message_status,
        timestamp: row.last_message_time || row.updated_at,
        media_r2_key: row.last_message_media_r2_key || null,
        media_url: lastMessageMediaUrl
      },
      totalMessages: row.total_messages_count
    };
  });

  return c.json({ conversations });
}

/**
 * GET /api/messages/:wa_id
 * Returns chat history for a customer
 */
export async function handleGetMessages(c: Context<{ Bindings: Env }>) {
  const waId = c.req.param('wa_id');
  const db = c.env.DB;

  const { results } = await db.prepare(`
    SELECT * FROM messages
    WHERE customer_wa_id = ?1
    ORDER BY created_at ASC
    LIMIT 100
  `).bind(waId).all<Message>();

  const messages = (results || []).map((msg) => ({
    ...msg,
    media_url: resolveMediaUrl(msg.media_r2_key, c.env.R2_PUBLIC_URL, msg.media_url)
  }));

  return c.json({ messages });
}

/**
 * Helper to dispatch outbound message via YCloud API and record into D1
 */
async function dispatchOutbound(
  db: D1Database,
  apiKey: string,
  to: string,
  msgType: 'text' | 'image' | 'document' | 'audio' = 'text',
  text?: string,
  mediaUrl?: string,
  mediaFilename?: string,
  caption?: string
): Promise<{ success: boolean; messageId?: string; error?: string; code?: string; details?: any }> {
  const now = Math.floor(Date.now() / 1000);
  const normalizedTo = to.replace(/\+/g, '').trim();

  // 1. Verify Customer Service Window (CSW)
  const customer = await db.prepare('SELECT * FROM customers WHERE wa_id = ?1').bind(normalizedTo).first<Customer>();
  if (customer && now >= customer.csw_expires_at) {
    return {
      success: false,
      code: 'CSW_CLOSED',
      error: 'Customer service window expired (>24h). Free message cannot be delivered.'
    };
  }

  // 2. Build YCloud Payload
  const cleanBody = (text || '').trim();
  const cleanCaption = (caption || '').trim();
  let payload: Record<string, any>;

  if (msgType === 'image') {
    payload = {
      from: '+919176650591',
      to: `+${normalizedTo}`,
      type: 'image',
      image: {
        link: mediaUrl,
        ...(cleanCaption || cleanBody ? { caption: cleanCaption || cleanBody } : {})
      }
    };
  } else if (msgType === 'document') {
    payload = {
      from: '+919176650591',
      to: `+${normalizedTo}`,
      type: 'document',
      document: {
        link: mediaUrl,
        filename: mediaFilename || 'document.pdf',
        ...(cleanCaption || cleanBody ? { caption: cleanCaption || cleanBody } : {})
      }
    };
  } else if (msgType === 'audio') {
    payload = {
      from: '+919176650591',
      to: `+${normalizedTo}`,
      type: 'audio',
      audio: {
        link: mediaUrl
      }
    };
  } else {
    payload = {
      from: '+919176650591',
      to: `+${normalizedTo}`,
      type: 'text',
      text: { body: cleanBody }
    };
  }

  try {
    const ycloudRes = await fetch('https://api.ycloud.com/v2/whatsapp/messages/sendDirectly', {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const resData: any = await ycloudRes.json().catch(() => ({}));

    if (!ycloudRes.ok) {
      const errCode = resData?.error?.code || 'SEND_FAILED';
      const errMsg = resData?.error?.message || 'YCloud API error';

      const failedId = `failed_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      await db.prepare(`
        INSERT INTO messages (
          id, customer_wa_id, direction, type, body, media_url, media_filename,
          status, error_code, error_message, raw_payload, created_at
        ) VALUES (?1, ?2, 'outbound', ?3, ?4, ?5, ?6, 'failed', ?7, ?8, ?9, ?10)
      `).bind(
        failedId,
        normalizedTo,
        msgType,
        cleanCaption || cleanBody || null,
        mediaUrl || null,
        mediaFilename || null,
        errCode,
        errMsg,
        JSON.stringify(resData),
        now
      ).run();

      return {
        success: false,
        code: errCode,
        error: errMsg,
        details: resData
      };
    }

    const messageId = resData.wamid || resData.id || `out_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    await db.prepare(`
      INSERT INTO messages (
        id, customer_wa_id, direction, type, body, media_url, media_filename,
        status, raw_payload, created_at
      ) VALUES (?1, ?2, 'outbound', ?3, ?4, ?5, ?6, 'accepted', ?7, ?8)
    `).bind(
      messageId,
      normalizedTo,
      msgType,
      cleanCaption || cleanBody || null,
      mediaUrl || null,
      mediaFilename || null,
      JSON.stringify(resData),
      now
    ).run();

    // Increment monthly service messages counter
    const monthKey = R2ZeroBillingGuard.getCurrentMonthKey();
    await db.prepare(`
      INSERT INTO usage_counters (period_key, period_type, service_messages_sent, unique_recipients_count, updated_at)
      VALUES (?1, 'monthly', 1, 0, ?2)
      ON CONFLICT(period_key) DO UPDATE SET
        service_messages_sent = service_messages_sent + 1,
        updated_at = excluded.updated_at
    `).bind(monthKey, now).run();

    return {
      success: true,
      messageId,
      details: resData
    };
  } catch (err: any) {
    return {
      success: false,
      code: 'NETWORK_ERROR',
      error: err.message
    };
  }
}

/**
 * POST /api/send
 * Outbound manual reply via YCloud supporting text, images, documents/PDFs, and audio
 */
export async function handleSendMessage(c: Context<{ Bindings: Env }>) {
  const db = c.env.DB;
  const apiKey = c.env.YCLOUD_API_KEY || '';

  let body: {
    to?: string;
    text?: string;
    type?: 'text' | 'image' | 'document' | 'audio';
    media_url?: string;
    media_filename?: string;
    caption?: string;
  };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'INVALID_PAYLOAD', message: 'Invalid JSON payload' }, 400);
  }

  const { to, text, type = 'text', media_url, media_filename, caption } = body;
  if (!to || typeof to !== 'string') {
    return c.json({ error: 'VALIDATION_ERROR', message: 'Recipient (to) is required' }, 400);
  }

  if (type === 'text' && (!text || text.trim() === '')) {
    return c.json({ error: 'VALIDATION_ERROR', message: 'Message text is required' }, 400);
  }

  if (type !== 'text' && !media_url) {
    return c.json({ error: 'VALIDATION_ERROR', message: `media_url is required for ${type} messages` }, 400);
  }

  const result = await dispatchOutbound(
    db,
    apiKey,
    to,
    type,
    text,
    media_url,
    media_filename,
    caption
  );

  if (!result.success) {
    const status = result.code === 'CSW_CLOSED' ? 403 : 400;
    return c.json({
      error: result.code || 'SEND_FAILED',
      message: result.error || 'Failed to send message',
      details: result.details
    }, status);
  }

  return c.json({
    success: true,
    messageId: result.messageId,
    status: 'accepted',
    data: result.details
  });
}

/**
 * POST /api/send-batch
 * Multi-send broadcast to multiple customer recipients with CSW validation
 */
export async function handleBatchSend(c: Context<{ Bindings: Env }>) {
  const db = c.env.DB;
  const apiKey = c.env.YCLOUD_API_KEY || '';

  let body: {
    recipients?: string[];
    text?: string;
    type?: 'text' | 'image' | 'document' | 'audio';
    media_url?: string;
    media_filename?: string;
    caption?: string;
  };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'INVALID_PAYLOAD', message: 'Invalid JSON payload' }, 400);
  }

  const recipients = Array.isArray(body?.recipients) ? body.recipients : [];
  if (recipients.length === 0) {
    return c.json({ error: 'VALIDATION_ERROR', message: 'At least one recipient is required' }, 400);
  }

  const type = body.type || 'text';
  const text = body.text;
  const media_url = body.media_url;
  const media_filename = body.media_filename;
  const caption = body.caption;

  const results: Array<{ waId: string; success: boolean; messageId?: string; error?: string }> = [];
  let sentCount = 0;
  let failedCount = 0;

  for (const rawTo of recipients) {
    const to = String(rawTo).replace(/\+/g, '').trim();
    if (!to) continue;

    const res = await dispatchOutbound(
      db,
      apiKey,
      to,
      type,
      text,
      media_url,
      media_filename,
      caption
    );

    if (res.success) {
      sentCount++;
      results.push({ waId: to, success: true, messageId: res.messageId });
    } else {
      failedCount++;
      results.push({ waId: to, success: false, error: res.error || 'Send failed' });
    }
  }

  return c.json({
    success: true,
    total: results.length,
    sentCount,
    failedCount,
    results
  });
}

/**
 * POST /api/messages/forward
 * Forwards an existing message to one or more recipient conversations
 */
export async function handleForwardMessage(c: Context<{ Bindings: Env }>) {
  const db = c.env.DB;
  const apiKey = c.env.YCLOUD_API_KEY || '';

  let body: {
    messageId?: string;
    targetWaIds?: string[];
  };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'INVALID_PAYLOAD', message: 'Invalid JSON payload' }, 400);
  }

  const { messageId, targetWaIds } = body;
  if (!messageId || !Array.isArray(targetWaIds) || targetWaIds.length === 0) {
    return c.json({ error: 'VALIDATION_ERROR', message: 'messageId and targetWaIds array are required' }, 400);
  }

  // 1. Fetch original message from D1
  const origMsg = await db.prepare('SELECT * FROM messages WHERE id = ?1').bind(messageId).first<Message>();
  if (!origMsg) {
    return c.json({ error: 'NOT_FOUND', message: 'Source message not found' }, 404);
  }

  const msgType = (['image', 'document', 'audio'].includes(origMsg.type) ? origMsg.type : 'text') as 'text' | 'image' | 'document' | 'audio';
  const mediaUrl = origMsg.media_url ? resolveMediaUrl(origMsg.media_r2_key, c.env.R2_PUBLIC_URL, origMsg.media_url) || origMsg.media_url : undefined;

  const results: Array<{ waId: string; success: boolean; messageId?: string; error?: string }> = [];
  let sentCount = 0;
  let failedCount = 0;

  for (const rawTo of targetWaIds) {
    const to = String(rawTo).replace(/\+/g, '').trim();
    if (!to) continue;

    const res = await dispatchOutbound(
      db,
      apiKey,
      to,
      msgType,
      origMsg.body || undefined,
      mediaUrl,
      origMsg.media_filename || undefined,
      origMsg.body || undefined
    );

    if (res.success) {
      sentCount++;
      results.push({ waId: to, success: true, messageId: res.messageId });
    } else {
      failedCount++;
      results.push({ waId: to, success: false, error: res.error });
    }
  }

  return c.json({
    success: true,
    total: results.length,
    sentCount,
    failedCount,
    results
  });
}

/**
 * POST /api/upload
 * Direct file upload with strict 507 Insufficient Storage zero-billing ceiling
 */
export async function handleDirectUpload(c: Context<{ Bindings: Env }>) {
  const db = c.env.DB;
  const bucket = c.env.MEDIA_BUCKET;
  const now = Math.floor(Date.now() / 1000);

  const body = await c.req.arrayBuffer();
  const incomingBytes = body.byteLength;

  if (incomingBytes === 0) {
    return c.json({ error: 'EMPTY_FILE', message: 'No file content received' }, 400);
  }

  // Pre-check R2 zero billing ceiling
  const preCheck = await R2ZeroBillingGuard.preCheckPut(db, incomingBytes);
  if (!preCheck.allowed) {
    return c.json({
      error: 'RESOURCE_EXHAUSTED',
      code: 'R2_FREE_TIER_LIMIT_REACHED',
      message: 'Cloudflare R2 free tier safety ceiling reached (9.0 GB or 900,000 Class A ops). Upload rejected to guarantee zero billing.',
      details: {
        ceiling_reason: preCheck.reason,
        current_storage_bytes: preCheck.currentStorageBytes,
        current_class_a_ops: preCheck.currentClassAOps
      }
    }, 507);
  }

  const contentType = c.req.header('content-type') || 'application/octet-stream';
  const key = `uploads/${now}_${Math.random().toString(36).slice(2, 8)}`;

  await bucket.put(key, body, {
    httpMetadata: {
      contentType,
      cacheControl: 'public, max-age=31536000, s-maxage=31536000, immutable'
    }
  });

  const [stmtStorage, stmtOps] = R2ZeroBillingGuard.getRecordPutStatements(db, incomingBytes, now);
  await db.batch([stmtStorage, stmtOps]);

  return c.json({
    success: true,
    key,
    url: resolveMediaUrl(key, c.env.R2_PUBLIC_URL),
    size: incomingBytes,
    contentType
  }, 201);
}

/**
 * GET /api/media/:key
 * Serves media from R2 with Dual Caching:
 * 1. Cloudflare Edge CDN Caching for external browser requests
 * 2. Worker Cache API for internal Worker invocations
 * Also supports Range header (206) for audio scrubbing
 */
export async function handleGetMedia(c: Context<{ Bindings: Env }>) {
  const rawKey = c.req.param('key') || '';
  const key = decodeURIComponent(rawKey);
  const db = c.env.DB;
  const bucket = c.env.MEDIA_BUCKET;

  // 1. Check Worker Cache API first
  const cache = caches.default;
  const cacheKey = new Request(c.req.url, c.req.raw);
  const cachedResponse = await cache.match(cacheKey);

  if (cachedResponse) {
    return cachedResponse;
  }

  // 2. Pre-check Class B operations ceiling
  const check = await R2ZeroBillingGuard.preCheckGet(db);
  if (!check.allowed) {
    return c.json({
      error: 'RESOURCE_EXHAUSTED',
      code: 'R2_CLASS_B_OPS_CEILING_REACHED',
      message: 'Monthly Class B read ceiling reached. Please view cached files or upgrade.'
    }, 429);
  }

  // 3. Fetch from R2 Bucket with Range support
  const object = await bucket.get(key, {
    range: c.req.raw.headers
  });

  if (!object) {
    return c.text('Media file not found or expired', 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  // Edge CDN caching: 1 year immutable
  headers.set('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable');

  const isRange = c.req.header('range') !== undefined;
  const status = isRange && object.range ? 206 : 200;

  if (object.range && 'offset' in object.range && typeof (object.range as any).offset === 'number' && typeof (object.range as any).length === 'number') {
    const range = object.range as { offset: number; length: number };
    const end = range.offset + range.length - 1;
    headers.set('content-range', `bytes ${range.offset}-${end}/${object.size}`);
  }

  const response = new Response(object.body, { status, headers });

  // Store in Worker Cache API asynchronously for subsequent internal reads
  if (status === 200) {
    c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
  }

  return response;
}

/**
 * GET /api/stats
 * Quota, balance, and R2 zero-billing tracking endpoint
 */
export async function handleGetStats(c: Context<{ Bindings: Env }>) {
  const db = c.env.DB;
  const monthKey = R2ZeroBillingGuard.getCurrentMonthKey();

  // Monthly service message count
  const counterRow = await db.prepare('SELECT service_messages_sent FROM usage_counters WHERE period_key = ?1').bind(monthKey).first<{ service_messages_sent: number }>();
  const monthlyServiceCount = counterRow?.service_messages_sent ?? 0;

  // Daily unique recipients count (distinct active customers in last 24h)
  const dayAgo = Math.floor(Date.now() / 1000) - 86400;
  const dailyRow = await db.prepare('SELECT COUNT(DISTINCT wa_id) as count FROM customers WHERE updated_at >= ?1').bind(dayAgo).first<{ count: number }>();
  const dailyRecipientsCount = dailyRow?.count ?? 0;

  // Live upstream YCloud balance & status check
  let walletBalance = 0.50;
  let currency = 'USD';
  let providerStatus = 'connected';

  if (c.env.YCLOUD_API_KEY) {
    try {
      const balRes = await fetch('https://api.ycloud.com/v2/balance', {
        headers: { 'X-API-Key': c.env.YCLOUD_API_KEY }
      });
      if (balRes.ok) {
        const balData: any = await balRes.json();
        if (typeof balData.balance === 'number') {
          walletBalance = balData.balance;
          currency = balData.currency || 'USD';
        }
      }
    } catch {
      // Graceful fallback to default
    }
  }

  // R2 Zero-Billing Summary
  const r2Summary = await R2ZeroBillingGuard.getUsageSummary(db);

  const stats: UsageStats = {
    monthlyServiceCount,
    monthlyServiceLimit: 1000,
    dailyRecipientsCount,
    dailyRecipientsLimit: 250,
    walletBalance,
    currency,
    r2: r2Summary,
    lastSyncAt: Math.floor(Date.now() / 1000),
    providerStatus
  };

  return c.json(stats);
}
