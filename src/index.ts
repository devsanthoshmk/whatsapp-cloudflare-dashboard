import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import { handleWebhookVerification, handleWebhookPost } from './handlers/webhook';
import {
  handleAuthLogin,
  handleAuthLogout,
  handleAuthCheck,
  handleGetWaitlist,
  handleUpdateWaitlistStatus,
  handleGetConversations,
  handleGetMessages,
  handleSendMessage,
  handleBatchSend,
  handleForwardMessage,
  handleDirectUpload,
  handleGetMedia,
  handleGetStats
} from './handlers/api';
import {
  handleGetAIToolsSpec,
  handleExecuteAITool,
  handleQueryRAG,
  handleIndexRAG,
  handleGetCatalog,
  handleCalculateBilling,
  handleCreateInvoice,
  handleGetInvoices,
  handleGetInvoiceById
} from './handlers/ai-api';
import { AuthService } from './services/auth';
import { R2ZeroBillingGuard } from './services/r2-guard';

const app = new Hono<{ Bindings: Env }>();

// Enable CORS for API routes
app.use('/api/*', cors());

// Auth middleware to protect all /api/* routes EXCEPT /api/auth/*, /api/health, and /api/ai/tools (spec)
app.use('/api/*', async (c, next) => {
  // Pass through preflight CORS checks
  if (c.req.method === 'OPTIONS') {
    return next();
  }

  const path = c.req.path;
  if (path.startsWith('/api/auth/') || path === '/api/health' || path === '/api/ai/tools') {
    return next();
  }

  // Check Authorization Bearer header first (API / Agent access)
  const authHeader = c.req.header('Authorization') || c.req.header('authorization');
  const adminPassword = c.env.ADMIN_PASSWORD || c.env.AUTH_PASSWORD;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearerToken = authHeader.slice(7).trim();
    if (adminPassword && bearerToken === adminPassword) {
      return next();
    }
    const secret = c.env.AUTH_SECRET;
    if (secret && (await AuthService.verifySessionToken(bearerToken, secret))) {
      return next();
    }
  }

  const cookieHeader = c.req.header('Cookie') || c.req.header('cookie');
  const token = AuthService.extractSessionCookie(cookieHeader);
  if (!token) {
    return c.json({ error: 'UNAUTHORIZED', message: 'Authentication required' }, 401);
  }

  const secret = c.env.AUTH_SECRET;
  if (!secret) {
    return c.json({ error: 'SERVER_MISCONFIGURED', message: 'AUTH_SECRET is not configured on server' }, 500);
  }
  const isValid = await AuthService.verifySessionToken(token, secret);
  if (!isValid) {
    return c.json({ error: 'UNAUTHORIZED', message: 'Authentication required' }, 401);
  }

  return next();
});

// Webhook routes (exempt from session auth so Meta/YCloud webhooks can deliver)
app.get('/webhook', handleWebhookVerification);
app.post('/webhook', handleWebhookPost);

// Auth routes
app.post('/api/auth/login', handleAuthLogin);
app.post('/api/auth/logout', handleAuthLogout);
app.get('/api/auth/check', handleAuthCheck);

// API routes
app.get('/api/waitlist', handleGetWaitlist);
app.patch('/api/waitlist/:id', handleUpdateWaitlistStatus);
app.post('/api/waitlist/:id/status', handleUpdateWaitlistStatus);
app.get('/api/conversations', handleGetConversations);
app.get('/api/messages/:wa_id', handleGetMessages);
app.post('/api/send', handleSendMessage);
app.post('/api/send-batch', handleBatchSend);
app.post('/api/messages/forward', handleForwardMessage);
app.post('/api/upload', handleDirectUpload);
app.get('/api/media/:key{.+$}', handleGetMedia);
app.get('/api/stats', handleGetStats);

// AI Tools Harness & Execution routes
app.get('/api/ai/tools', handleGetAIToolsSpec);
app.post('/api/ai/tools/execute', handleExecuteAITool);

// AI Vector RAG routes
app.post('/api/ai/rag/query', handleQueryRAG);
app.post('/api/ai/rag/index', handleIndexRAG);

// AYUSH Catalog & Billing routes
app.get('/api/catalog', handleGetCatalog);
app.post('/api/billing/calculate', handleCalculateBilling);
app.post('/api/billing/invoices', handleCreateInvoice);
app.get('/api/billing/invoices', handleGetInvoices);
app.get('/api/billing/invoices/:id', handleGetInvoiceById);

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
