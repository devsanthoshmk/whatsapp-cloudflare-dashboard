import type { Env, Message, AIToolDefinition, AIToolExecutionResult } from '../types';
import { VectorEngine } from './vector';
import { BillingEngine, type RawLineItemInput } from './billing';
import { MediaExtractorService } from './media-extractor';
import { resolveMediaUrl } from '../handlers/api';
import { ensureDatabaseAndCatalog } from './catalog-seed';

/**
 * Registry of all available AI tools with standard OpenAPI / JSON Schema declarations.
 * Compatible with OpenAI Function Calling, Anthropic Tool Use, and Vercel AI SDK.
 */
export const AI_TOOL_DEFINITIONS: AIToolDefinition[] = [
  {
    name: 'get_message',
    description: 'Retrieve a specific WhatsApp message by message ID with sender, body, and resolved media URL.',
    parameters: {
      type: 'object',
      properties: {
        message_id: { type: 'string', description: 'The unique WhatsApp message ID to look up.' }
      },
      required: ['message_id']
    }
  },
  {
    name: 'query_chat_history',
    description: 'Retrieve chronological or filtered WhatsApp message history for a customer.',
    parameters: {
      type: 'object',
      properties: {
        customer_wa_id: { type: 'string', description: 'Customer WhatsApp phone number with country code.' },
        limit: { type: 'integer', description: 'Max messages to return (default 20, max 100).' },
        direction: { type: 'string', enum: ['inbound', 'outbound', 'all'], description: 'Filter by message direction.' },
        since_timestamp: { type: 'integer', description: 'Unix timestamp in seconds to fetch messages after.' }
      },
      required: ['customer_wa_id']
    }
  },
  {
    name: 'search_customer_rag',
    description: 'Semantic RAG search over customer chat embeddings using normalized cosine similarity.',
    parameters: {
      type: 'object',
      properties: {
        customer_wa_id: { type: 'string', description: 'Customer WhatsApp phone number.' },
        query_text: { type: 'string', description: 'Search query in natural language.' },
        query_vector: {
          type: 'array',
          items: { type: 'number' },
          description: 'Optional pre-computed query embedding vector. If omitted, query_text is converted to deterministic vector.'
        },
        top_k: { type: 'integer', description: 'Number of top matching chunks to return (default 5).' },
        min_similarity: { type: 'number', description: 'Minimum cosine similarity threshold between 0.0 and 1.0 (default 0.4).' }
      },
      required: ['customer_wa_id']
    }
  },
  {
    name: 'index_chat_message',
    description: 'Store and index vector embeddings for a WhatsApp message into D1 vector storage for RAG retrieval.',
    parameters: {
      type: 'object',
      properties: {
        message_id: { type: 'string', description: 'Message ID being indexed.' },
        customer_wa_id: { type: 'string', description: 'Customer WhatsApp phone number.' },
        chunk_text: { type: 'string', description: 'The textual chunk content to index.' },
        embedding_vector: {
          type: 'array',
          items: { type: 'number' },
          description: 'Array of floating point numbers representing the embedding. If omitted, generated deterministically from chunk_text.'
        },
        metadata: { type: 'object', description: 'Optional metadata key-values.' }
      },
      required: ['message_id', 'customer_wa_id', 'chunk_text']
    }
  },
  {
    name: 'prepare_media_for_extraction',
    description: 'Prepare handwritten image, PDF, or document for multimodal extraction with direct URLs and OCR hints.',
    parameters: {
      type: 'object',
      properties: {
        message_id: { type: 'string', description: 'The WhatsApp message ID containing media.' }
      },
      required: ['message_id']
    }
  },
  {
    name: 'lookup_ayush_catalog',
    description: 'Lookup AYUSH Ayurvedic products by commercial name, Sanskrit classical name, SKU, or category.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term (e.g., Ashwagandha, Triphala, Tailam, Churna).' },
        category: { type: 'string', description: 'Optional category filter.' },
        limit: { type: 'integer', description: 'Maximum number of results (default 10).' }
      },
      required: ['query']
    }
  },
  {
    name: 'validate_billing_items',
    description: 'Validate line items against AYUSH catalog, verify SKU validity, MRP prices, and stock availability.',
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              sku: { type: 'string', description: 'Product SKU code or partial name.' },
              name: { type: 'string', description: 'Product name if SKU unknown.' },
              quantity: { type: 'number', description: 'Quantity requested.' },
              unit_mrp: { type: 'number', description: 'Unit price claimed.' },
              discount_percent: { type: 'number', description: 'Discount percentage.' }
            },
            required: ['quantity']
          }
        }
      },
      required: ['items']
    }
  },
  {
    name: 'calculate_invoice_totals',
    description: 'Compute taxable subtotals, 5% and 12% AYUSH GST breakdowns, shipping, and rounded totals.',
    parameters: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              sku: { type: 'string' },
              name: { type: 'string' },
              classical_name: { type: 'string' },
              hsn_code: { type: 'string' },
              gst_rate: { type: 'number', description: '0.05 for classical or 0.12 for proprietary.' },
              unit_mrp: { type: 'number' },
              quantity: { type: 'number' },
              discount_percent: { type: 'number' }
            },
            required: ['sku', 'name', 'unit_mrp', 'quantity']
          }
        },
        shipping_fee: { type: 'number', description: 'Shipping or courier fee (default 0).' },
        overall_discount_percent: { type: 'number', description: 'Overall order discount percent.' },
        is_interstate: { type: 'boolean', description: 'True if outside Tamil Nadu (IGST instead of CGST+SGST).' }
      },
      required: ['items']
    }
  },
  {
    name: 'create_invoice_draft',
    description: 'Persist a calculated invoice into billing_records table and generate an official invoice number.',
    parameters: {
      type: 'object',
      properties: {
        customer_wa_id: { type: 'string', description: 'Customer WhatsApp phone number.' },
        source_message_id: { type: 'string', description: 'Original message ID that initiated order.' },
        source_media_type: { type: 'string', description: 'direct_text, handwritten_prescription, printed_bill, or pdf_document.' },
        items: { type: 'array', description: 'Array of raw or catalog-matched items.' },
        shipping_fee: { type: 'number' },
        overall_discount_percent: { type: 'number' },
        is_interstate: { type: 'boolean' },
        notes: { type: 'string' }
      },
      required: ['customer_wa_id', 'items']
    }
  },
  {
    name: 'get_customer_billing_history',
    description: 'Retrieve previous invoices, payment statuses, and lifetime totals for a customer.',
    parameters: {
      type: 'object',
      properties: {
        customer_wa_id: { type: 'string', description: 'Customer WhatsApp phone number.' },
        limit: { type: 'integer', description: 'Max records to return (default 10).' }
      },
      required: ['customer_wa_id']
    }
  },
  {
    name: 'format_whatsapp_invoice_message',
    description: 'Render an invoice record into a clean, monospace-formatted WhatsApp message ready to send.',
    parameters: {
      type: 'object',
      properties: {
        invoice_id: { type: 'string', description: 'The invoice ID or invoice number.' }
      },
      required: ['invoice_id']
    }
  }
];

export class AIToolRegistry {
  /**
   * Executes an AI tool deterministically by name with validated arguments.
   */
  static async execute(
    toolName: string,
    args: any,
    env: Env
  ): Promise<AIToolExecutionResult> {
    const timestamp = Date.now();

    // Ensure database tables and catalog are seeded
    await ensureDatabaseAndCatalog(env.DB);

    try {
      switch (toolName) {
        case 'get_message': {
          const { message_id } = args || {};
          if (!message_id) {
            return { tool: toolName, success: false, error: { code: 'MISSING_PARAM', message: 'message_id is required' }, timestamp };
          }

          const msg = await env.DB.prepare('SELECT * FROM messages WHERE id = ?1').bind(message_id).first<Message>();
          if (!msg) {
            return { tool: toolName, success: false, error: { code: 'NOT_FOUND', message: `Message '${message_id}' not found` }, timestamp };
          }

          const resolvedMediaUrl = resolveMediaUrl(msg.media_r2_key, env.R2_PUBLIC_URL, msg.media_url);

          return {
            tool: toolName,
            success: true,
            result: {
              ...msg,
              resolved_media_url: resolvedMediaUrl
            },
            timestamp
          };
        }

        case 'query_chat_history': {
          const { customer_wa_id, limit = 20, direction = 'all', since_timestamp = 0 } = args || {};
          if (!customer_wa_id) {
            return { tool: toolName, success: false, error: { code: 'MISSING_PARAM', message: 'customer_wa_id is required' }, timestamp };
          }

          const cleanLimit = Math.min(100, Math.max(1, Number(limit) || 20));
          let query = 'SELECT * FROM messages WHERE customer_wa_id = ?1';
          const params: any[] = [customer_wa_id];

          if (direction === 'inbound' || direction === 'outbound') {
            query += ' AND direction = ?2';
            params.push(direction);
          }

          if (since_timestamp > 0) {
            query += ` AND created_at >= ?${params.length + 1}`;
            params.push(Number(since_timestamp));
          }

          query += ` ORDER BY created_at ASC LIMIT ?${params.length + 1}`;
          params.push(cleanLimit);

          const { results } = await env.DB.prepare(query).bind(...params).all<Message>();
          const enhanced = results.map(m => ({
            ...m,
            resolved_media_url: resolveMediaUrl(m.media_r2_key, env.R2_PUBLIC_URL, m.media_url)
          }));

          return {
            tool: toolName,
            success: true,
            result: {
              customer_wa_id,
              count: enhanced.length,
              messages: enhanced
            },
            timestamp
          };
        }

        case 'search_customer_rag': {
          const { customer_wa_id, query_text, query_vector, top_k = 5, min_similarity = 0.1 } = args || {};
          if (!customer_wa_id) {
            return { tool: toolName, success: false, error: { code: 'MISSING_PARAM', message: 'customer_wa_id is required' }, timestamp };
          }

          let qVec = query_vector;
          if (!Array.isArray(qVec) || qVec.length === 0) {
            if (!query_text) {
              return { tool: toolName, success: false, error: { code: 'INVALID_QUERY', message: 'Either query_vector or query_text must be provided' }, timestamp };
            }
            qVec = VectorEngine.generateDeterministicEmbedding(query_text);
          }

          // Fetch embeddings for this customer
          const { results } = await env.DB.prepare(
            'SELECT * FROM chat_embeddings WHERE customer_wa_id = ?1'
          ).bind(customer_wa_id).all<any>();

          if (!results || results.length === 0) {
            return {
              tool: toolName,
              success: true,
              result: { customer_wa_id, matches: [], message: 'No indexed embeddings found for this customer' },
              timestamp
            };
          }

          const candidates = results.map(row => {
            let vec: number[] = [];
            try {
              vec = JSON.parse(row.embedding_vector);
            } catch {
              vec = [];
            }
            return {
              vector: vec,
              isNormalized: row.is_normalized === 1,
              payload: {
                id: row.id,
                message_id: row.message_id,
                chunk_index: row.chunk_index,
                chunk_text: row.chunk_text,
                created_at: row.created_at,
                metadata: row.metadata ? JSON.parse(row.metadata) : null
              }
            };
          }).filter(c => c.vector.length === qVec.length);

          const ranked = VectorEngine.searchTopK(qVec, candidates, Number(top_k) || 5, Number(min_similarity) || 0.4);

          return {
            tool: toolName,
            success: true,
            result: {
              customer_wa_id,
              match_count: ranked.length,
              matches: ranked
            },
            timestamp
          };
        }

        case 'index_chat_message': {
          const { message_id, customer_wa_id, chunk_text, embedding_vector, metadata } = args || {};
          if (!message_id || !customer_wa_id || !chunk_text) {
            return { tool: toolName, success: false, error: { code: 'MISSING_PARAM', message: 'message_id, customer_wa_id, and chunk_text are required' }, timestamp };
          }

          let vec = embedding_vector;
          if (!Array.isArray(vec) || vec.length === 0) {
            vec = VectorEngine.generateDeterministicEmbedding(chunk_text);
          }

          const normVec = VectorEngine.normalize(vec);
          const id = `emb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const now = Date.now();

          await env.DB.prepare(`
            INSERT INTO chat_embeddings (
              id, message_id, customer_wa_id, chunk_index,
              chunk_text, embedding_dimension, embedding_vector,
              is_normalized, metadata, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
          `).bind(
            id,
            message_id,
            customer_wa_id,
            0,
            chunk_text,
            normVec.length,
            JSON.stringify(normVec),
            1,
            metadata ? JSON.stringify(metadata) : null,
            now
          ).run();

          return {
            tool: toolName,
            success: true,
            result: {
              indexed_id: id,
              message_id,
              dimension: normVec.length,
              status: 'indexed'
            },
            timestamp
          };
        }

        case 'prepare_media_for_extraction': {
          const { message_id } = args || {};
          if (!message_id) {
            return { tool: toolName, success: false, error: { code: 'MISSING_PARAM', message: 'message_id is required' }, timestamp };
          }

          const msg = await env.DB.prepare('SELECT * FROM messages WHERE id = ?1').bind(message_id).first<Message>();
          if (!msg) {
            return { tool: toolName, success: false, error: { code: 'NOT_FOUND', message: `Message '${message_id}' not found` }, timestamp };
          }

          const descriptor = MediaExtractorService.buildDescriptor(msg, env.R2_PUBLIC_URL);

          return {
            tool: toolName,
            success: true,
            result: descriptor,
            timestamp
          };
        }

        case 'lookup_ayush_catalog': {
          const { query = '', category, limit = 10 } = args || {};
          const cleanLimit = Math.min(50, Math.max(1, Number(limit) || 10));
          const term = `%${String(query).trim().toLowerCase()}%`;

          let sql = `
            SELECT * FROM product_catalog
            WHERE is_active = 1
            AND (LOWER(name) LIKE ?1 OR LOWER(classical_name) LIKE ?1 OR LOWER(sku) LIKE ?1 OR LOWER(description) LIKE ?1)
          `;
          const params: any[] = [term];

          if (category) {
            sql += ' AND category = ?2';
            params.push(category);
          }

          sql += ` ORDER BY name ASC LIMIT ?${params.length + 1}`;
          params.push(cleanLimit);

          const { results } = await env.DB.prepare(sql).bind(...params).all<any>();

          return {
            tool: toolName,
            success: true,
            result: {
              query,
              count: results.length,
              products: results
            },
            timestamp
          };
        }

        case 'validate_billing_items': {
          const { items = [] } = args || {};
          if (!Array.isArray(items) || items.length === 0) {
            return { tool: toolName, success: false, error: { code: 'INVALID_ITEMS', message: 'items array is required and cannot be empty' }, timestamp };
          }

          const validatedLines: RawLineItemInput[] = [];
          const unverifiedItems: any[] = [];

          for (const item of items) {
            let matchedProduct: any = null;

            if (item.sku) {
              matchedProduct = await env.DB.prepare(
                'SELECT * FROM product_catalog WHERE sku = ?1 AND is_active = 1'
              ).bind(item.sku).first<any>();
            }

            if (!matchedProduct && item.name) {
              const nameTerm = `%${item.name.trim().toLowerCase()}%`;
              matchedProduct = await env.DB.prepare(
                'SELECT * FROM product_catalog WHERE (LOWER(name) LIKE ?1 OR LOWER(classical_name) LIKE ?1) AND is_active = 1 LIMIT 1'
              ).bind(nameTerm).first<any>();
            }

            if (matchedProduct) {
              validatedLines.push({
                sku: matchedProduct.sku,
                name: matchedProduct.name,
                classical_name: matchedProduct.classical_name,
                hsn_code: matchedProduct.hsn_code,
                gst_rate: matchedProduct.gst_rate,
                unit_mrp: matchedProduct.unit_mrp,
                quantity: Math.max(1, Number(item.quantity) || 1),
                discount_percent: typeof item.discount_percent === 'number' ? item.discount_percent : 0
              });
            } else {
              unverifiedItems.push(item);
            }
          }

          return {
            tool: toolName,
            success: true,
            result: {
              all_valid: unverifiedItems.length === 0,
              validated_count: validatedLines.length,
              unverified_count: unverifiedItems.length,
              validated_items: validatedLines,
              unverified_items: unverifiedItems
            },
            timestamp
          };
        }

        case 'calculate_invoice_totals': {
          const { items, shipping_fee = 0, overall_discount_percent = 0, is_interstate = false } = args || {};
          if (!Array.isArray(items) || items.length === 0) {
            return { tool: toolName, success: false, error: { code: 'INVALID_ITEMS', message: 'items array is required' }, timestamp };
          }

          const calculation = BillingEngine.calculateInvoice({
            items,
            shipping_fee,
            overall_discount_percent,
            is_interstate
          });

          return {
            tool: toolName,
            success: true,
            result: calculation,
            timestamp
          };
        }

        case 'create_invoice_draft': {
          const {
            customer_wa_id,
            source_message_id,
            source_media_type = 'direct_text',
            items,
            shipping_fee = 0,
            overall_discount_percent = 0,
            is_interstate = false,
            notes
          } = args || {};

          if (!customer_wa_id || !Array.isArray(items) || items.length === 0) {
            return { tool: toolName, success: false, error: { code: 'MISSING_PARAM', message: 'customer_wa_id and items are required' }, timestamp };
          }

          // First validate items against catalog if needed
          const linesToCalculate: RawLineItemInput[] = [];
          for (const item of items) {
            if (item.sku && item.unit_mrp && item.hsn_code && item.gst_rate) {
              linesToCalculate.push(item);
            } else {
              // Lookup from catalog
              const lookup = await env.DB.prepare(
                'SELECT * FROM product_catalog WHERE (sku = ?1 OR LOWER(name) LIKE ?2) AND is_active = 1 LIMIT 1'
              ).bind(item.sku || '', `%${(item.name || '').trim().toLowerCase()}%`).first<any>();

              if (lookup) {
                linesToCalculate.push({
                  sku: lookup.sku,
                  name: lookup.name,
                  classical_name: lookup.classical_name,
                  hsn_code: lookup.hsn_code,
                  gst_rate: lookup.gst_rate,
                  unit_mrp: lookup.unit_mrp,
                  quantity: Math.max(1, Number(item.quantity) || 1),
                  discount_percent: item.discount_percent || overall_discount_percent || 0
                });
              } else {
                linesToCalculate.push({
                  sku: item.sku || 'AYU-GEN',
                  name: item.name || 'Ayurvedic Medicine',
                  hsn_code: '3004 90 11',
                  gst_rate: 0.05,
                  unit_mrp: Number(item.unit_mrp) || 100,
                  quantity: Math.max(1, Number(item.quantity) || 1),
                  discount_percent: item.discount_percent || 0
                });
              }
            }
          }

          const calculation = BillingEngine.calculateInvoice({
            items: linesToCalculate,
            shipping_fee,
            overall_discount_percent,
            is_interstate
          });

          // Count existing records to generate sequential invoice number
          const countRes = await env.DB.prepare('SELECT COUNT(*) as cnt FROM billing_records').first<{ cnt: number }>();
          const invoiceNumber = BillingEngine.generateInvoiceNumber(countRes?.cnt || 0);

          // Get customer name if exists
          const customer = await env.DB.prepare('SELECT name FROM customers WHERE wa_id = ?1').bind(customer_wa_id).first<{ name: string }>();

          const formattedMessage = BillingEngine.formatWhatsAppInvoice(
            invoiceNumber,
            customer_wa_id,
            calculation,
            customer?.name
          );

          const id = `bill_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const now = Date.now();

          await env.DB.prepare(`
            INSERT INTO billing_records (
              id, invoice_number, customer_wa_id, status, source_message_id,
              source_media_type, extraction_metadata, items_json, subtotal,
              tax_total, tax_breakdown_json, discount_total, shipping_fee,
              rounding_adjustment, grand_total, currency, notes, formatted_wa_message,
              created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)
          `).bind(
            id,
            invoiceNumber,
            customer_wa_id,
            'draft',
            source_message_id || null,
            source_media_type,
            null,
            JSON.stringify(calculation.items),
            calculation.subtotal,
            calculation.tax_total,
            JSON.stringify(calculation.tax_breakdown),
            calculation.discount_total,
            calculation.shipping_fee,
            calculation.rounding_adjustment,
            calculation.grand_total,
            'INR',
            notes || null,
            formattedMessage,
            now,
            now
          ).run();

          return {
            tool: toolName,
            success: true,
            result: {
              invoice_id: id,
              invoice_number: invoiceNumber,
              customer_wa_id,
              status: 'draft',
              grand_total: calculation.grand_total,
              calculation,
              formatted_wa_message: formattedMessage
            },
            timestamp
          };
        }

        case 'get_customer_billing_history': {
          const { customer_wa_id, limit = 10 } = args || {};
          if (!customer_wa_id) {
            return { tool: toolName, success: false, error: { code: 'MISSING_PARAM', message: 'customer_wa_id is required' }, timestamp };
          }

          const cleanLimit = Math.min(50, Math.max(1, Number(limit) || 10));
          const { results } = await env.DB.prepare(
            'SELECT * FROM billing_records WHERE customer_wa_id = ?1 ORDER BY created_at DESC LIMIT ?2'
          ).bind(customer_wa_id, cleanLimit).all<any>();

          const formatted = results.map(row => ({
            ...row,
            items: row.items_json ? JSON.parse(row.items_json) : [],
            tax_breakdown: row.tax_breakdown_json ? JSON.parse(row.tax_breakdown_json) : null
          }));

          return {
            tool: toolName,
            success: true,
            result: {
              customer_wa_id,
              count: formatted.length,
              invoices: formatted
            },
            timestamp
          };
        }

        case 'format_whatsapp_invoice_message': {
          const { invoice_id } = args || {};
          if (!invoice_id) {
            return { tool: toolName, success: false, error: { code: 'MISSING_PARAM', message: 'invoice_id is required' }, timestamp };
          }

          const bill = await env.DB.prepare(
            'SELECT * FROM billing_records WHERE id = ?1 OR invoice_number = ?1'
          ).bind(invoice_id).first<any>();

          if (!bill) {
            return { tool: toolName, success: false, error: { code: 'NOT_FOUND', message: `Invoice '${invoice_id}' not found` }, timestamp };
          }

          let messageText = bill.formatted_wa_message;
          if (!messageText) {
            const items = bill.items_json ? JSON.parse(bill.items_json) : [];
            const calculation = BillingEngine.calculateInvoice({ items });
            messageText = BillingEngine.formatWhatsAppInvoice(bill.invoice_number, bill.customer_wa_id, calculation);
          }

          return {
            tool: toolName,
            success: true,
            result: {
              invoice_number: bill.invoice_number,
              customer_wa_id: bill.customer_wa_id,
              grand_total: bill.grand_total,
              whatsapp_message: messageText
            },
            timestamp
          };
        }

        default:
          return {
            tool: toolName,
            success: false,
            error: {
              code: 'UNKNOWN_TOOL',
              message: `Tool '${toolName}' is not registered in the AI tool registry.`
            },
            timestamp
          };
      }
    } catch (err: any) {
      return {
        tool: toolName,
        success: false,
        error: {
          code: 'EXECUTION_ERROR',
          message: err?.message || 'An unexpected error occurred during tool execution',
          details: String(err)
        },
        timestamp
      };
    }
  }
}
