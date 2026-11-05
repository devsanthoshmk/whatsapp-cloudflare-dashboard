import type { R2StatsSummary } from '../types';

export const R2_LIMITS = {
  // 10 GB hard limit; 9.0 GB safety ceiling
  STORAGE_HARD_LIMIT_BYTES: 10 * 1024 * 1024 * 1024,
  STORAGE_SAFETY_CEILING_BYTES: 9 * 1024 * 1024 * 1024,
  
  // 1,000,000 monthly Class A ops; 900,000 safety ceiling
  CLASS_A_HARD_LIMIT: 1_000_000,
  CLASS_A_SAFETY_CEILING: 900_000,
  
  // 10,000,000 monthly Class B ops; 9,000,000 safety ceiling
  CLASS_B_HARD_LIMIT: 10_000_000,
  CLASS_B_SAFETY_CEILING: 9_000_000,
  
  // 30-day automatic retention window
  LIFECYCLE_DAYS: 30,
};

export interface R2PreCheckResult {
  allowed: boolean;
  reason?: 'STORAGE_CEILING_REACHED' | 'CLASS_A_CEILING_REACHED' | 'CLASS_B_CEILING_REACHED';
  currentStorageBytes: number;
  currentClassAOps: number;
  currentClassBOps: number;
}

export class R2ZeroBillingGuard {
  public static getCurrentMonthKey(date = new Date()): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    return `month_${year}-${month}`;
  }

  public static async preCheckPut(
    db: D1Database,
    incomingBytes: number
  ): Promise<R2PreCheckResult> {
    const monthKey = this.getCurrentMonthKey();

    const query = `
      SELECT 
        (SELECT COALESCE(storage_bytes, 0) FROM r2_usage WHERE period_key = 'cumulative_storage') AS current_storage,
        (SELECT COALESCE(class_a_ops, 0) FROM r2_usage WHERE period_key = ?1) AS current_class_a,
        (SELECT COALESCE(class_b_ops, 0) FROM r2_usage WHERE period_key = ?1) AS current_class_b
    `;

    const row = await db.prepare(query).bind(monthKey).first<{
      current_storage: number;
      current_class_a: number;
      current_class_b: number;
    }>();

    const currentStorage = row?.current_storage ?? 0;
    const currentClassA = row?.current_class_a ?? 0;
    const currentClassB = row?.current_class_b ?? 0;

    if (currentStorage + incomingBytes >= R2_LIMITS.STORAGE_SAFETY_CEILING_BYTES) {
      return {
        allowed: false,
        reason: 'STORAGE_CEILING_REACHED',
        currentStorageBytes: currentStorage,
        currentClassAOps: currentClassA,
        currentClassBOps: currentClassB,
      };
    }

    if (currentClassA + 1 >= R2_LIMITS.CLASS_A_SAFETY_CEILING) {
      return {
        allowed: false,
        reason: 'CLASS_A_CEILING_REACHED',
        currentStorageBytes: currentStorage,
        currentClassAOps: currentClassA,
        currentClassBOps: currentClassB,
      };
    }

    return {
      allowed: true,
      currentStorageBytes: currentStorage,
      currentClassAOps: currentClassA,
      currentClassBOps: currentClassB,
    };
  }

  public static async preCheckGet(db: D1Database): Promise<{ allowed: boolean; reason?: string }> {
    const monthKey = this.getCurrentMonthKey();
    const row = await db
      .prepare('SELECT COALESCE(class_b_ops, 0) as class_b FROM r2_usage WHERE period_key = ?1')
      .bind(monthKey)
      .first<{ class_b: number }>();

    const currentClassB = row?.class_b ?? 0;
    if (currentClassB >= R2_LIMITS.CLASS_B_SAFETY_CEILING) {
      return { allowed: false, reason: 'CLASS_B_CEILING_REACHED' };
    }
    return { allowed: true };
  }

  public static getRecordPutStatements(
    db: D1Database,
    bytesStored: number,
    nowSeconds = Math.floor(Date.now() / 1000)
  ): D1PreparedStatement[] {
    const monthKey = this.getCurrentMonthKey();

    const stmtStorage = db.prepare(`
      INSERT INTO r2_usage (period_key, metric_type, storage_bytes, class_a_ops, class_b_ops, is_capped, last_updated)
      VALUES ('cumulative_storage', 'storage', ?1, 0, 0, 0, ?2)
      ON CONFLICT(period_key) DO UPDATE SET
        storage_bytes = storage_bytes + excluded.storage_bytes,
        last_updated = excluded.last_updated;
    `).bind(bytesStored, nowSeconds);

    const stmtOps = db.prepare(`
      INSERT INTO r2_usage (period_key, metric_type, storage_bytes, class_a_ops, class_b_ops, is_capped, last_updated)
      VALUES (?1, 'operations', 0, 1, 0, 0, ?2)
      ON CONFLICT(period_key) DO UPDATE SET
        class_a_ops = class_a_ops + 1,
        last_updated = excluded.last_updated;
    `).bind(monthKey, nowSeconds);

    return [stmtStorage, stmtOps];
  }

  public static async reconcileStorage(
    db: D1Database,
    nowSeconds = Math.floor(Date.now() / 1000)
  ): Promise<{ activeBytes: number }> {
    const cutoffTimestamp = nowSeconds - (R2_LIMITS.LIFECYCLE_DAYS * 86400);

    const result = await db.prepare(`
      SELECT COALESCE(SUM(media_size), 0) AS active_bytes
      FROM messages
      WHERE created_at >= ?1
        AND media_r2_key IS NOT NULL
        AND status != 'media_capped_free_limit'
    `).bind(cutoffTimestamp).first<{ active_bytes: number }>();

    const activeBytes = result?.active_bytes ?? 0;

    await db.prepare(`
      INSERT INTO r2_usage (period_key, metric_type, storage_bytes, class_a_ops, class_b_ops, is_capped, last_updated)
      VALUES ('cumulative_storage', 'storage', ?1, 0, 0, 0, ?2)
      ON CONFLICT(period_key) DO UPDATE SET
        storage_bytes = excluded.storage_bytes,
        last_updated = excluded.last_updated;
    `).bind(activeBytes, nowSeconds).run();

    return { activeBytes };
  }

  public static async getUsageSummary(db: D1Database): Promise<R2StatsSummary> {
    const monthKey = this.getCurrentMonthKey();
    const query = `
      SELECT 
        (SELECT COALESCE(storage_bytes, 0) FROM r2_usage WHERE period_key = 'cumulative_storage') AS storage_bytes,
        (SELECT COALESCE(class_a_ops, 0) FROM r2_usage WHERE period_key = ?1) AS class_a_ops,
        (SELECT COALESCE(class_b_ops, 0) FROM r2_usage WHERE period_key = ?1) AS class_b_ops
    `;

    const row = await db.prepare(query).bind(monthKey).first<{
      storage_bytes: number;
      class_a_ops: number;
      class_b_ops: number;
    }>();

    const storageBytes = row?.storage_bytes ?? 0;
    const classAOps = row?.class_a_ops ?? 0;
    const classBOps = row?.class_b_ops ?? 0;

    const storageCapped = storageBytes >= R2_LIMITS.STORAGE_SAFETY_CEILING_BYTES;
    const classACapped = classAOps >= R2_LIMITS.CLASS_A_SAFETY_CEILING;
    const classBCapped = classBOps >= R2_LIMITS.CLASS_B_SAFETY_CEILING;

    const isCapped = storageCapped || classACapped || classBCapped;
    let activeCapReason: string | null = null;
    if (storageCapped) activeCapReason = 'R2_STORAGE_CEILING_REACHED';
    else if (classACapped) activeCapReason = 'R2_CLASS_A_OPS_CEILING_REACHED';
    else if (classBCapped) activeCapReason = 'R2_CLASS_B_OPS_CEILING_REACHED';

    return {
      storageBytes,
      storageCeilingBytes: R2_LIMITS.STORAGE_SAFETY_CEILING_BYTES,
      storageUsagePercent: Number(((storageBytes / R2_LIMITS.STORAGE_SAFETY_CEILING_BYTES) * 100).toFixed(1)),
      classAOps,
      classACeiling: R2_LIMITS.CLASS_A_SAFETY_CEILING,
      classAUsagePercent: Number(((classAOps / R2_LIMITS.CLASS_A_SAFETY_CEILING) * 100).toFixed(1)),
      classBOps,
      classBCeiling: R2_LIMITS.CLASS_B_SAFETY_CEILING,
      classBUsagePercent: Number(((classBOps / R2_LIMITS.CLASS_B_SAFETY_CEILING) * 100).toFixed(1)),
      isCapped,
      activeCapReason,
    };
  }
}
