import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import { handleWebhookVerification, handleWebhookPost } from './handlers/webhook';
import {
  handleGetConversations,
  handleGetMessages,
  handleSendMessage,
  handleDirectUpload,
  handleGetMedia,
  handleGetStats
} from './handlers/api';
import { R2ZeroBillingGuard } from './services/r2-guard';

const app = new Hono<{ Bindings: Env }>();

// Enable CORS for API routes
app.use('/api/*', cors());

// Webhook routes
app.get('/webhook', handleWebhookVerification);
app.post('/webhook', handleWebhookPost);

// API routes
app.get('/api/conversations', handleGetConversations);
app.get('/api/messages/:wa_id', handleGetMessages);
app.post('/api/send', handleSendMessage);
app.post('/api/upload', handleDirectUpload);
app.get('/api/media/:key{.+$}', handleGetMedia);
app.get('/api/stats', handleGetStats);

// Health check
app.get('/api/health', (c) => c.json({ status: 'ok', service: 'whatsapp-cloudflare-dashboard', time: new Date().toISOString() }));

export default {
  fetch: app.fetch,

  // Daily cron job for R2 storage reconciliation
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      R2ZeroBillingGuard.reconcileStorage(env.DB).then((res) => {
        console.log(`[R2 RECONCILE] Active storage reconciled: ${res.activeBytes} bytes`);
      })
    );
  }
};
