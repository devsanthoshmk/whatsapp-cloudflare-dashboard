/**
 * Stateless HMAC-SHA256 Authentication Service using Web Crypto API
 * Zero-cost in-memory session signing and verification without database lookups.
 */

export interface SessionData {
  exp: number; // Expiration timestamp in seconds
  iat: number; // Issued at timestamp in seconds
}

export class AuthService {
  private static readonly DEFAULT_EXP_SECONDS = 7 * 24 * 3600; // 7 days

  /**
   * Generates a signed session token: base64url(payload).hexSignature
   */
  public static async createSessionToken(
    secret: string,
    expSeconds: number = this.DEFAULT_EXP_SECONDS
  ): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const payload: SessionData = {
      iat: now,
      exp: now + expSeconds
    };

    const payloadStr = JSON.stringify(payload);
    const encoder = new TextEncoder();

    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadStr));
    const sigHex = Array.from(new Uint8Array(signature))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const b64Payload = btoa(payloadStr)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    return `${b64Payload}.${sigHex}`;
  }

  /**
   * Verifies session token validity and expiration with constant-time HMAC check
   */
  public static async verifySessionToken(token: string, secret: string): Promise<boolean> {
    try {
      const [b64Payload, sigHex] = token.split('.');
      if (!b64Payload || !sigHex || sigHex.length !== 64) {
        return false;
      }

      // Restore base64 padding
      let base64 = b64Payload.replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) {
        base64 += '=';
      }

      const payloadStr = atob(base64);
      const data: SessionData = JSON.parse(payloadStr);

      const now = Math.floor(Date.now() / 1000);
      if (!data.exp || now > data.exp) {
        return false;
      }

      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
      );

      const sigBytes = new Uint8Array(
        sigHex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
      );

      return await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(payloadStr));
    } catch {
      return false;
    }
  }

  /**
   * Extracts session cookie value from incoming Request headers
   */
  public static extractSessionCookie(cookieHeader: string | null | undefined): string | null {
    if (!cookieHeader) return null;
    const cookies = cookieHeader.split(';');
    for (const cookie of cookies) {
      const [name, val] = cookie.trim().split('=');
      if (name === 'session' && val) {
        return decodeURIComponent(val);
      }
    }
    return null;
  }
}
