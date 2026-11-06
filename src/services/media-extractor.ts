import type { Message, MediaExtractionDescriptor } from '../types';
import { resolveMediaUrl } from '../handlers/api';

export class MediaExtractorService {
  /**
   * Prepares a comprehensive media extraction descriptor from a WhatsApp message record.
   * Provides domain-specific AYUSH terminology hints, OCR targets, and direct accessible URLs.
   */
  static buildDescriptor(
    message: Message,
    r2PublicUrl?: string
  ): MediaExtractionDescriptor {
    const isImage = (message.type === 'image') || (message.media_mime?.startsWith('image/') ?? false);
    const isPdf = (message.type === 'document' && message.media_filename?.endsWith('.pdf')) || (message.media_mime === 'application/pdf');
    const isAudio = (message.type === 'audio') || (message.media_mime?.startsWith('audio/') ?? false);

    let classification: MediaExtractionDescriptor['media_classification'] = 'direct_text';
    if (isImage) {
      // Analyze filename or body keywords for prescription cues
      const hint = `${message.media_filename || ''} ${message.body || ''}`.toLowerCase();
      if (hint.includes('presc') || hint.includes('rx') || hint.includes('dr') || hint.includes('doc')) {
        classification = 'handwritten_prescription';
      } else {
        classification = 'printed_bill';
      }
    } else if (isPdf) {
      classification = 'pdf_document';
    } else if (isAudio) {
      classification = 'voice_note';
    }

    const resolvedDirectUrl = resolveMediaUrl(message.media_r2_key, r2PublicUrl, message.media_url) || '';
    const internalDownloadUrl = message.media_r2_key ? `/api/media/${encodeURIComponent(message.media_r2_key)}` : (message.media_url || '');

    return {
      message_id: message.id,
      customer_wa_id: message.customer_wa_id,
      media_classification: classification,
      mime_type: message.media_mime || (isPdf ? 'application/pdf' : isImage ? 'image/jpeg' : 'text/plain'),
      direct_access_url: resolvedDirectUrl,
      download_api_url: internalDownloadUrl,
      ocr_guidance: {
        detection_target: isImage
          ? 'Extract patient details, prescribing physician, medicine names (classical or proprietary), dosage forms, strengths, quantities, and duration.'
          : isPdf
          ? 'Parse digital invoice lines, HSN codes, quantity, unit rates, tax amounts, and invoice number.'
          : 'Parse text order request for medicine names, quantity counts, and preferred pack sizes.',
        ayush_terminology_hints: [
          'Kashayam',
          'Arishtam',
          'Tailam',
          'Ghritam',
          'Vati',
          'Gutika',
          'Churna',
          'Lehyam',
          'Bhasma',
          'Rasayana',
          'Kwatham',
          'Asavam',
          'Guggulu',
          'Lepam'
        ],
        handwriting_quirks: isImage
          ? 'Account for doctor shorthand: "BD" (twice daily), "TDS" (thrice daily), "HS" (bedtime), "OD" (once daily), "1-0-1", and Rx headers.'
          : undefined
      },
      raw_text_body: message.body,
      filename: message.media_filename,
      size: message.media_size
    };
  }
}
