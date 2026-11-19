/**
 * Sheet password protection helpers.
 *
 * The product we interoperate with stores a verifier inside the sheet JSON as
 * `{ algorithmName: 'SHA-512', hashValue, saltValue, spinCount: 100000 }`
 * (base64 encoded, 16-byte salt, 64-byte digest). The internal key-derivation
 * construction of that product is not published, so we keep the same JSON
 * shape but derive the verifier with our own scheme: RFC 6070 style
 * PBKDF2-HMAC-SHA512, password encoded as UTF-16LE, 100000 iterations,
 * 64-byte output. Verifiers produced by this module verify inside OpenSheets;
 * password verifiers written by the other product cannot be verified here and
 * vice versa (documented limitation in docs/DESIGNER.md).
 */
import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { sha512 } from '@noble/hashes/sha512';
import { randomBytes } from '@noble/hashes/utils';

/** Iteration count mirrored from the interop field `spinCount`. */
export const PROTECTION_SPIN_COUNT = 100000;

const SALT_BYTES = 16;
const HASH_BYTES = 64;

const toBase64 = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes));

const fromBase64 = (value: string): Uint8Array | null => {
  try {
    const raw = atob(value);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
};

/** UTF-16LE little-endian password bytes (same convention as OOXML digests). */
const passwordBytes = (password: string): Uint8Array => {
  const bytes = new Uint8Array(password.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < password.length; i++) view.setUint16(i * 2, password.charCodeAt(i), true);
  return bytes;
};

/**
 * Fixed verifier pair for the empty password so `protect('')` and
 * `unprotect('')` stay O(1) instead of running 100k HMAC rounds. Pre-computed
 * with the very same PBKDF2 call below; the value only depends on this salt.
 */
const EMPTY_SALT = 'T3BlblNoZWV0cyFzYWx0MQ==';
const EMPTY_HASH =
  '1DXVNEoXP38HpDZfUAVjO6aeNRuceEuMjl5wKU2I2cFWTWFmkpcpe68GMMD0RHISo5tm3QNGoC2aBKEV8kkwew==';

/** Derive the sheet password verifier. Empty password yields the fast pair. */
export function hashSheetPassword(
  password: string,
  saltValue?: string,
): { hashValue: string; saltValue: string } {
  if (!password) return { hashValue: EMPTY_HASH, saltValue: EMPTY_SALT };
  const salt = (saltValue && fromBase64(saltValue)) || randomBytes(SALT_BYTES);
  const hash = pbkdf2(sha512, passwordBytes(password), salt, {
    c: PROTECTION_SPIN_COUNT,
    dkLen: HASH_BYTES,
  });
  return { hashValue: toBase64(hash), saltValue: toBase64(salt) };
}

/** Constant-time-ish comparison to avoid timing leaks on short digests. */
function equalBase64(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Verify a candidate password against stored verifier fields. */
export function verifySheetPassword(password: string, saltValue: string, hashValue: string): boolean {
  if (saltValue === EMPTY_SALT && hashValue === EMPTY_HASH) return !password;
  if (!password) return false;
  const salt = fromBase64(saltValue);
  if (!salt) return false;
  const hash = pbkdf2(sha512, passwordBytes(password), salt, {
    c: PROTECTION_SPIN_COUNT,
    dkLen: HASH_BYTES,
  });
  return equalBase64(toBase64(hash), hashValue);
}

/** True when a stored verifier belongs to a real (non-empty) password. */
export function isRealPasswordVerifier(protectionOptions: Record<string, unknown> | undefined): boolean {
  const hash = protectionOptions?.hashValue, salt = protectionOptions?.saltValue;
  if (typeof hash !== 'string' || typeof salt !== 'string' || !hash || !salt) return false;
  return !(salt === EMPTY_SALT && hash === EMPTY_HASH);
}
