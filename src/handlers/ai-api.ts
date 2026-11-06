import type { Context } from 'hono';
import type { Env } from '../types';
import { AI_TOOL_DEFINITIONS, AIToolRegistry } from '../services/ai-tools';
import { VectorEngine } from '../services/vector';
import { BillingEngine } from '../services/billing';
import { ensureDatabaseAndCatalog } from '../services/catalog-seed';

/**
 * GET /api/ai/tools
 * Returns the complete specification of all available AI tools in OpenAPI/JSON Schema format.
 */
export async function handleGetAIToolsSpec(c: Context<{ Bindings: Env }>) {
  return c.json({
    success: true,
    count: AI_TOOL_DEFINITIONS.length,
    tools: AI_TOOL_DEFINITIONS
  });
}

/**
 * POST /api/ai/tools/execute
 * Executes an AI tool deterministically with validated arguments.
 * Body: { tool: string, arguments?: Record<string, any> }
 */
export async function handleExecuteAITool(c: Context<{ Bindings: Env }>) {
  let body: { tool?: string; arguments?: any } = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON' } }, 400);
  }

  const { tool, arguments: args = {} } = body;
  if (!tool) {
    return c.json({ success: false, error: { code: 'MISSING_TOOL_NAME', message: 'Field "tool" is required' } }, 400);
  }

  try {
    const result = await AIToolRegistry.execute(tool, args, c.env);
    const status = result.success ? 200 : (result.error?.code === 'NOT_FOUND' ? 404 : 400);
    return c.json(result, status as any);
  } catch (err: any) {
    return c.json({ success: false, error: { code: 'SERVER_ERROR', message: err?.message || String(err), stack: err?.stack } }, 500);
  }
}

/**
 * POST /api/ai/rag/query
 * Semantic vector search over customer chat embeddings.
 * Body: { customer_wa_id: string, query_text?: string, query_vector?: number[], top_k?: number, min_similarity?: number }
 */
export async function handleQueryRAG(c: Context<{ Bindings: Env }>) {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400);
  }

  const result = await AIToolRegistry.execute('search_customer_rag', body, c.env);
  return c.json(result, result.success ? 200 : 400);
}

/**
 * POST /api/ai/rag/index
 * Index message chunk and vector embedding into D1 vector store.
 * Body: { message_id: string, customer_wa_id: string, chunk_text: string, embedding_vector?: number[], metadata?: object }
 */
export async function handleIndexRAG(c: Context<{ Bindings: Env }>) {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400);
  }

  const result = await AIToolRegistry.execute('index_chat_message', body, c.env);
  return c.json(result, result.success ? 201 : 400);
}

/**
 * GET /api/catalog
 * Search AYUSH product catalog.
 * Query params: ?q=triphala&category=churna&limit=20
 */
export async function handleGetCatalog(c: Context<{ Bindings: Env }>) {
  await ensureDatabaseAndCatalog(c.env.DB);
  const q = c.req.query('q') || '';
  const category = c.req.query('category') || undefined;
  const limit = Math.min(50, Math.max(1, Number(c.req.query('limit')) || 20));

  const result = await AIToolRegistry.execute('lookup_ayush_catalog', { query: q, category, limit }, c.env);
  return c.json(result);
}

/**
 * POST /api/billing/calculate
 * Calculate AYUSH invoice totals with 5% and 12% GST breakdowns.
 * Body: { items: Array<...>, shipping_fee?: number, overall_discount_percent?: number, is_interstate?: boolean }
 */
export async function handleCalculateBilling(c: Context<{ Bindings: Env }>) {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400);
  }

  const result = await AIToolRegistry.execute('calculate_invoice_totals', body, c.env);
  return c.json(result, result.success ? 200 : 400);
}

/**
 * GET /api/billing/invoices
 * List billing records / invoices.
 * Query params: ?customer_wa_id=917904127446&limit=10
 */
export async function handleGetInvoices(c: Context<{ Bindings: Env }>) {
  await ensureDatabaseAndCatalog(c.env.DB);
  const customerWaId = c.req.query('customer_wa_id');
  const limit = Math.min(50, Math.max(1, Number(c.req.query('limit')) || 20));

  if (customerWaId) {
    const result = await AIToolRegistry.execute('get_customer_billing_history', { customer_wa_id: customerWaId, limit }, c.env);
    return c.json(result);
  }

  const { results } = await c.env.DB.prepare(
    'SELECT * FROM billing_records ORDER BY created_at DESC LIMIT ?1'
  ).bind(limit).all<any>();

  const formatted = results.map(row => ({
    ...row,
    items: row.items_json ? JSON.parse(row.items_json) : [],
    tax_breakdown: row.tax_breakdown_json ? JSON.parse(row.tax_breakdown_json) : null
  }));

  return c.json({
    success: true,
    count: formatted.length,
    invoices: formatted
  });
}

/**
 * POST /api/billing/invoices
 * Create and persist a new billing draft / invoice record.
 * Body: { customer_wa_id: string, items: Array<...>, shipping_fee?: number, notes?: string }
 */
export async function handleCreateInvoice(c: Context<{ Bindings: Env }>) {
  let body: any = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400);
  }

  const result = await AIToolRegistry.execute('create_invoice_draft', body, c.env);
  return c.json(result, result.success ? 201 : 400);
}

/**
 * GET /api/billing/invoices/:id
 * Retrieve specific invoice record with rendered WhatsApp layout.
 */
export async function handleGetInvoiceById(c: Context<{ Bindings: Env }>) {
  await ensureDatabaseAndCatalog(c.env.DB);
  const id = c.req.param('id');
  if (!id) {
    return c.json({ success: false, error: 'Invoice ID is required' }, 400);
  }

  const bill = await c.env.DB.prepare(
    'SELECT * FROM billing_records WHERE id = ?1 OR invoice_number = ?1'
  ).bind(id).first<any>();

  if (!bill) {
    return c.json({ success: false, error: `Invoice '${id}' not found` }, 404);
  }

  const items = bill.items_json ? JSON.parse(bill.items_json) : [];
  const taxBreakdown = bill.tax_breakdown_json ? JSON.parse(bill.tax_breakdown_json) : null;

  return c.json({
    success: true,
    invoice: {
      ...bill,
      items,
      tax_breakdown: taxBreakdown
    }
  });
}
