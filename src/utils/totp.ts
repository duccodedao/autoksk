/**
 * RFC 6238 Time-Based One-Time Password (TOTP) Utility
 * Compatible with Google Authenticator, Microsoft Authenticator, Authy, 1Password, Apple Passwords.
 * Works in both Browser (Web Crypto API) and Node.js (globalThis.crypto.subtle).
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export const DEFAULT_ADMIN_TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'; // Default initial Base32 secret until Admin customizes it

export interface AdminTotpConfig {
  enabled: boolean;
  secret: string; // Base32 encoded secret
  issuer: string;
  accountName: string;
  updatedAt: string;
  updatedBy: string;
}

export const DEFAULT_ADMIN_TOTP_CONFIG: AdminTotpConfig = {
  enabled: true,
  secret: DEFAULT_ADMIN_TOTP_SECRET,
  issuer: 'Auto KSK - HIS Suite',
  accountName: 'Admin Toàn Quyền',
  updatedAt: new Date().toISOString(),
  updatedBy: 'sonlyhongduc@gmail.com',
};

/**
 * Generates a cryptographically random 32-character Base32 secret (160-bit key)
 */
export function generateRandomBase32Secret(length = 32): string {
  const bytes = new Uint8Array(length);
  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let secret = '';
  for (let i = 0; i < length; i++) {
    secret += BASE32_ALPHABET[bytes[i] % 32];
  }
  return secret;
}

/**
 * Normalizes and validates a Base32 secret string
 */
export function cleanBase32Secret(input: string): string {
  return (input || '')
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z2-7]/g, '');
}

/**
 * Decodes a Base32 string into a Uint8Array
 */
export function base32ToBytes(base32: string): Uint8Array {
  const cleaned = cleanBase32Secret(base32);
  let bits = '';
  for (let i = 0; i < cleaned.length; i++) {
    const val = BASE32_ALPHABET.indexOf(cleaned[i]);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const byteCount = Math.floor(bits.length / 8);
  const bytes = new Uint8Array(byteCount);
  for (let i = 0; i < byteCount; i++) {
    bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  }
  return bytes;
}

/**
 * Generates a 6-digit TOTP token for a given Base32 secret and time counter
 */
export async function generateTotpAtCounter(
  base32Secret: string,
  counter: number,
  digits = 6
): Promise<string> {
  const keyBytes = base32ToBytes(base32Secret);
  if (keyBytes.length === 0) return '';

  const counterBuffer = new ArrayBuffer(8);
  const view = new DataView(counterBuffer);
  const high = Math.floor(counter / 0x100000000);
  const low = counter >>> 0;
  view.setUint32(0, high, false);
  view.setUint32(4, low, false);

  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'raw',
    keyBytes as unknown as BufferSource,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );

  const signature = await globalThis.crypto.subtle.sign('HMAC', cryptoKey, counterBuffer);
  const hmac = new Uint8Array(signature);

  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % Math.pow(10, digits);
  return otp.toString().padStart(digits, '0');
}

/**
 * Generates the current 6-digit TOTP token and remaining seconds in the 30s window
 */
export async function getCurrentTotpToken(
  base32Secret: string,
  periodSeconds = 30
): Promise<{ token: string; remainingSeconds: number }> {
  const nowSec = Math.floor(Date.now() / 1000);
  const counter = Math.floor(nowSec / periodSeconds);
  const remainingSeconds = periodSeconds - (nowSec % periodSeconds);
  const token = await generateTotpAtCounter(base32Secret, counter, 6);
  return { token, remainingSeconds };
}

/**
 * Verifies a 6-digit OTP code against a Base32 secret with +/- 1 step clock-drift tolerance
 */
export async function verifyTotpToken(
  inputCode: string,
  base32Secret: string,
  windowSteps = 1,
  periodSeconds = 30
): Promise<boolean> {
  const cleanedCode = (inputCode || '').replace(/\D/g, '');
  if (cleanedCode.length !== 6) return false;

  const cleanedSecret = cleanBase32Secret(base32Secret);
  if (!cleanedSecret) return false;

  const currentCounter = Math.floor(Date.now() / 1000 / periodSeconds);

  for (let offset = -windowSteps; offset <= windowSteps; offset++) {
    const expected = await generateTotpAtCounter(cleanedSecret, currentCounter + offset, 6);
    if (expected && expected === cleanedCode) {
      return true;
    }
  }
  return false;
}

/**
 * Builds standard otpauth:// URI for QR Code scanning in Google Authenticator / Authy
 */
export function buildOtpAuthUri(
  secret: string,
  accountName = 'Admin Toàn Quyền',
  issuer = 'Auto KSK - HIS Suite'
): string {
  const cleanSecret = cleanBase32Secret(secret);
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}`;
  return `otpauth://totp/${label}?secret=${cleanSecret}&issuer=${encodeURIComponent(
    issuer
  )}&algorithm=SHA1&digits=6&period=30`;
}
