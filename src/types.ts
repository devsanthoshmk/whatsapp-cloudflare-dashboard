export interface Env {
  DB: D1Database;
  MEDIA_BUCKET: R2Bucket;
  YCLOUD_API_KEY?: string;
  WEBHOOK_VERIFY_TOKEN?: string;
  PHONE_NUMBER_ID?: string;
  WABA_ID?: string;
  AUTH_PASSWORD?: string;
  ADMIN_EMAIL?: string;
  ADMIN_PASSWORD?: string;
  AUTH_SECRET?: string;
  R2_PUBLIC_URL?: string;
  ASSETS?: Fetcher;
}

export interface Customer {
  id: string;
  wa_id: string;
  phone_number: string;
  name: string | null;
  last_inbound_at: number;
  csw_expires_at: number;
  csw_source: 'organic' | 'ad';
  total_messages_count: number;
  created_at: number;
  updated_at: number;
}

export interface Message {
  id: string;
  customer_wa_id: string;
  direction: 'inbound' | 'outbound';
  type: string;
  body: string | null;
  media_r2_key: string | null;
  media_url: string | null;
  media_mime: string | null;
  media_filename: string | null;
  media_size: number | null;
  status: 'received' | 'accepted' | 'delivered' | 'read' | 'failed' | 'media_capped_free_limit';
  error_code: string | null;
  error_message: string | null;
  raw_payload: string | null;
  created_at: number;
}

export interface R2StatsSummary {
  storageBytes: number;
  storageCeilingBytes: number;
  storageUsagePercent: number;
  classAOps: number;
  classACeiling: number;
  classAUsagePercent: number;
  classBOps: number;
  classBCeiling: number;
  classBUsagePercent: number;
  isCapped: boolean;
  activeCapReason: string | null;
}

export interface UsageStats {
  monthlyServiceCount: number;
  monthlyServiceLimit: number;
  dailyRecipientsCount: number;
  dailyRecipientsLimit: number;
  walletBalance: number;
  currency: string;
  r2: R2StatsSummary;
  lastSyncAt?: number;
  providerStatus?: string;
}

export interface SendMessagePayload {
  to: string;
  text?: string;
  type?: 'text' | 'image' | 'document' | 'audio';
  media_url?: string;
  media_filename?: string;
  caption?: string;
}

export interface BatchSendPayload {
  recipients: string[];
  text?: string;
  type?: 'text' | 'image' | 'document' | 'audio';
  media_url?: string;
  media_filename?: string;
  caption?: string;
}

export interface BatchSendResult {
  total: number;
  sentCount: number;
  failedCount: number;
  results: Array<{
    waId: string;
    success: boolean;
    messageId?: string;
    error?: string;
  }>;
}

export interface ForwardMessagePayload {
  messageId: string;
  targetWaIds: string[];
}

export interface WaitlistEntry {
  id: string;
  email: string;
  status: string;
  attempt_count: number;
  last_attempt_at: number;
  created_at: number;
}

// ==========================================
// AI-Ready Tools, Vector RAG & Billing Types
// ==========================================

export interface ChatEmbedding {
  id: string;
  message_id: string;
  customer_wa_id: string;
  chunk_index: number;
  chunk_text: string;
  embedding_dimension: number;
  embedding_vector: string; // JSON array of numbers
  is_normalized: number;
  metadata?: string | null;
  created_at: number;
}

export interface ProductCatalogItem {
  id: string;
  sku: string;
  name: string;
  classical_name?: string | null;
  category: 'classical_medicine' | 'proprietary_formulation' | 'oil_tailam' | 'arishtam' | 'vati_gutika' | 'churna' | 'wellness' | string;
  hsn_code: string;
  gst_rate: number; // 0.05 for classical, 0.12 for proprietary
  unit_mrp: number;
  unit_measure: string;
  stock_quantity: number;
  is_active: number;
  description?: string | null;
  created_at: number;
  updated_at: number;
}

export interface BillingLineItem {
  sku: string;
  name: string;
  classical_name?: string;
  hsn_code: string;
  gst_rate: number;
  unit_mrp: number;
  quantity: number;
  discount_percent?: number;
  gross_amount: number;
  discount_amount: number;
  taxable_amount: number;
  tax_amount: number;
  total_amount: number;
}

export interface TaxBreakdown {
  is_interstate: boolean;
  cgst: number;
  sgst: number;
  igst: number;
  rate_5_taxable: number;
  rate_5_gst: number;
  rate_12_taxable: number;
  rate_12_gst: number;
  total_gst: number;
}

export interface BillingRecord {
  id: string;
  invoice_number: string;
  customer_wa_id: string;
  status: 'draft' | 'pending_payment' | 'paid' | 'cancelled';
  source_message_id?: string | null;
  source_media_type?: string | null;
  extraction_metadata?: string | null;
  items_json: string;
  subtotal: number;
  tax_total: number;
  tax_breakdown_json: string;
  discount_total: number;
  shipping_fee: number;
  rounding_adjustment: number;
  grand_total: number;
  currency: string;
  payment_link?: string | null;
  notes?: string | null;
  formatted_wa_message?: string | null;
  created_at: number;
  updated_at: number;
}

export interface MediaExtractionDescriptor {
  message_id: string;
  customer_wa_id: string;
  media_classification: 'direct_text' | 'handwritten_prescription' | 'printed_bill' | 'pdf_document' | 'voice_note';
  mime_type: string;
  direct_access_url: string;
  download_api_url: string;
  ocr_guidance: {
    detection_target: string;
    ayush_terminology_hints: string[];
    handwriting_quirks?: string;
  };
  raw_text_body?: string | null;
  filename?: string | null;
  size?: number | null;
}

export interface AIToolParameter {
  type: string;
  description?: string;
  enum?: string[];
  items?: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
  };
  properties?: Record<string, any>;
  required?: string[];
}

export interface AIToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, AIToolParameter>;
    required?: string[];
  };
}

export interface AIToolExecutionResult {
  tool: string;
  success: boolean;
  result?: any;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: number;
}


