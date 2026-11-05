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

