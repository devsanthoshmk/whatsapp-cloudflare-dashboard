import type { BillingLineItem, TaxBreakdown } from '../types';

export interface RawLineItemInput {
  sku: string;
  name: string;
  classical_name?: string;
  hsn_code: string;
  gst_rate: number; // 0.05 or 0.12
  unit_mrp: number;
  quantity: number;
  discount_percent?: number;
}

export interface InvoiceCalculationInput {
  items: RawLineItemInput[];
  shipping_fee?: number;
  overall_discount_percent?: number;
  is_interstate?: boolean;
}

export interface CalculatedInvoiceResult {
  items: BillingLineItem[];
  subtotal: number;
  tax_total: number;
  tax_breakdown: TaxBreakdown;
  discount_total: number;
  shipping_fee: number;
  rounding_adjustment: number;
  grand_total: number;
  currency: string;
}

export class BillingEngine {
  /**
   * Generates a unique, standardized invoice number.
   * Format: VYDY-YYYYMM-XXXX (e.g., VYDY-202611-0421)
   */
  static generateInvoiceNumber(existingCount: number = 0): string {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const seq = String((existingCount + 1) % 10000).padStart(4, '0');
    return `VYDY-${yyyy}${mm}-${seq || randomSuffix}`;
  }

  /**
   * Deterministically calculates invoice lines, GST breakdown, discounts, shipping,
   * and rounding according to Indian AYUSH statutory tax rules.
   */
  static calculateInvoice(input: InvoiceCalculationInput): CalculatedInvoiceResult {
    const {
      items: rawItems,
      shipping_fee = 0,
      overall_discount_percent = 0,
      is_interstate = false
    } = input;

    let subtotal = 0;
    let totalDiscount = 0;
    let rate5Taxable = 0;
    let rate5Gst = 0;
    let rate12Taxable = 0;
    let rate12Gst = 0;

    const calculatedLines: BillingLineItem[] = [];

    for (const raw of rawItems) {
      const qty = Math.max(1, raw.quantity);
      const mrp = Math.max(0, raw.unit_mrp);
      const gross = Number((qty * mrp).toFixed(2));

      // Determine applicable line discount percent (line discount takes priority, fallback to overall discount)
      const lineDiscPct = typeof raw.discount_percent === 'number' && raw.discount_percent >= 0
        ? raw.discount_percent
        : Math.max(0, overall_discount_percent);

      const discountAmt = Number(((gross * lineDiscPct) / 100).toFixed(2));
      const taxable = Number((gross - discountAmt).toFixed(2));

      // Validate GST rate: default to 5% if unspecified or classical, 12% if proprietary
      const gstRate = raw.gst_rate === 0.12 ? 0.12 : 0.05;
      const gstAmt = Number((taxable * gstRate).toFixed(2));
      const lineTotal = Number((taxable + gstAmt).toFixed(2));

      subtotal += taxable;
      totalDiscount += discountAmt;

      if (gstRate === 0.05) {
        rate5Taxable += taxable;
        rate5Gst += gstAmt;
      } else {
        rate12Taxable += taxable;
        rate12Gst += gstAmt;
      }

      calculatedLines.push({
        sku: raw.sku,
        name: raw.name,
        classical_name: raw.classical_name,
        hsn_code: raw.hsn_code || (gstRate === 0.05 ? '3004 90 11' : '3004 90 12'),
        gst_rate: gstRate,
        unit_mrp: mrp,
        quantity: qty,
        discount_percent: lineDiscPct,
        gross_amount: gross,
        discount_amount: discountAmt,
        taxable_amount: taxable,
        tax_amount: gstAmt,
        total_amount: lineTotal
      });
    }

    subtotal = Number(subtotal.toFixed(2));
    totalDiscount = Number(totalDiscount.toFixed(2));
    rate5Taxable = Number(rate5Taxable.toFixed(2));
    rate5Gst = Number(rate5Gst.toFixed(2));
    rate12Taxable = Number(rate12Taxable.toFixed(2));
    rate12Gst = Number(rate12Gst.toFixed(2));

    const totalGst = Number((rate5Gst + rate12Gst).toFixed(2));

    const cgst = is_interstate ? 0 : Number((totalGst / 2).toFixed(2));
    const sgst = is_interstate ? 0 : Number((totalGst - cgst).toFixed(2));
    const igst = is_interstate ? totalGst : 0;

    const taxBreakdown: TaxBreakdown = {
      is_interstate,
      cgst,
      sgst,
      igst,
      rate_5_taxable: rate5Taxable,
      rate_5_gst: rate5Gst,
      rate_12_taxable: rate12Taxable,
      rate_12_gst: rate12Gst,
      total_gst: totalGst
    };

    const cleanShipping = Number(Math.max(0, shipping_fee).toFixed(2));
    const rawGrandTotal = subtotal + totalGst + cleanShipping;
    const finalGrandTotal = Math.round(rawGrandTotal);
    const roundingAdj = Number((finalGrandTotal - rawGrandTotal).toFixed(2));

    return {
      items: calculatedLines,
      subtotal,
      tax_total: totalGst,
      tax_breakdown: taxBreakdown,
      discount_total: totalDiscount,
      shipping_fee: cleanShipping,
      rounding_adjustment: roundingAdj,
      grand_total: finalGrandTotal,
      currency: 'INR'
    };
  }

  /**
   * Renders a clean, monospace-aligned WhatsApp billing receipt message ready to dispatch.
   */
  static formatWhatsAppInvoice(
    invoiceNumber: string,
    customerWaId: string,
    calc: CalculatedInvoiceResult,
    customerName?: string | null,
    paymentLink?: string | null
  ): string {
    const dateStr = new Date().toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });

    const lines: string[] = [];
    lines.push(`*VYDY ONLINE AYUSH STORE*`);
    lines.push(`_Licensed Ayurvedic & Herbal Dispensary_`);
    lines.push(`────────────────────────────`);
    lines.push(`*Invoice #:* ${invoiceNumber}`);
    lines.push(`*Date:* ${dateStr}`);
    lines.push(`*Customer:* ${customerName || customerWaId}`);
    lines.push(`────────────────────────────`);
    lines.push(`*ORDER ITEMS*`);

    calc.items.forEach((item, idx) => {
      const classicalStr = item.classical_name ? ` (${item.classical_name})` : '';
      lines.push(`${idx + 1}. *${item.name}${classicalStr}*`);
      lines.push(`   ${item.quantity} × ₹${item.unit_mrp.toFixed(2)} | GST ${(item.gst_rate * 100).toFixed(0)}% = *₹${item.total_amount.toFixed(2)}*`);
    });

    lines.push(`────────────────────────────`);
    lines.push(`Taxable Subtotal: ₹${calc.subtotal.toFixed(2)}`);
    if (calc.discount_total > 0) {
      lines.push(`Discount Savings: -₹${calc.discount_total.toFixed(2)}`);
    }

    if (calc.tax_breakdown.is_interstate) {
      lines.push(`IGST (Inter-State): ₹${calc.tax_breakdown.igst.toFixed(2)}`);
    } else {
      lines.push(`CGST: ₹${calc.tax_breakdown.cgst.toFixed(2)}`);
      lines.push(`SGST: ₹${calc.tax_breakdown.sgst.toFixed(2)}`);
    }

    if (calc.shipping_fee > 0) {
      lines.push(`Shipping / Courier: ₹${calc.shipping_fee.toFixed(2)}`);
    }
    if (Math.abs(calc.rounding_adjustment) > 0) {
      const sign = calc.rounding_adjustment > 0 ? '+' : '';
      lines.push(`Rounding: ${sign}₹${calc.rounding_adjustment.toFixed(2)}`);
    }

    lines.push(`────────────────────────────`);
    lines.push(`*TOTAL PAYABLE: ₹${calc.grand_total.toFixed(2)}*`);
    lines.push(`────────────────────────────`);

    if (paymentLink) {
      lines.push(`*Payment Link:* ${paymentLink}`);
    } else {
      lines.push(`*Payment Mode:* UPI / GPay / NetBanking`);
      lines.push(`_UPI ID: vydy.ayush@icici_`);
    }

    lines.push(``);
    lines.push(`_Thank you for choosing Vydy for your wellness journey!_`);
    lines.push(`_Reply to this chat to confirm payment or dispatch update._`);

    return lines.join('\n');
  }
}
