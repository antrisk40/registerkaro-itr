import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * AES-256-CBC symmetric encryption utility.
 *
 * WHY NOT HASHING?
 *   This is an RPA bot that creates credentials on a government portal.
 *   The team must later log in with those credentials, so we need to be
 *   able to READ the password back — one-way hashing is impossible.
 *
 * WHY NOT PLAIN TEXT?
 *   Plain-text passwords in MongoDB will fail any security audit.
 *
 * SOLUTION: AES-256-CBC (symmetric encryption)
 *   - Encrypt before saving to MongoDB using a 32-byte master key from .env.
 *   - Decrypt on the fly only when an authorized operator clicks "Reveal".
 *   - The IV (Initialization Vector) is randomly generated per-encryption
 *     and prepended to the ciphertext, making every encrypted value unique
 *     even if the same password is encrypted twice.
 */

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16; // AES block size is always 16 bytes
const KEY_LENGTH = 32; // AES-256 requires exactly 32 bytes

function getKey() {
  const raw = process.env.ENCRYPTION_KEY || '';
  if (!raw) {
    console.warn('[Crypto] ⚠️  ENCRYPTION_KEY not set — using insecure fallback. Set it in service/.env immediately!');
  }
  // Derive a consistent 32-byte key using SHA-256 so the .env value can be
  // any length string rather than requiring exactly 32 ASCII chars.
  return crypto.createHash('sha256').update(raw || 'registerkaro_local_dev_key').digest();
}

/**
 * Encrypts a plain-text string.
 * @param {string} text  Plain-text password
 * @returns {string}     "iv_hex:ciphertext_hex"  — safe to store in MongoDB
 */
export function encrypt(text) {
  if (!text) return null;
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts an AES-256-CBC ciphertext produced by encrypt().
 * @param {string} encryptedText  "iv_hex:ciphertext_hex"
 * @returns {string}              Original plain-text, or 'DECRYPTION_FAILED'
 */
export function decrypt(encryptedText) {
  if (!encryptedText) return null;
  try {
    const [ivHex, ...rest] = encryptedText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = rest.join(':');
    const key = getKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('[Crypto] Decryption failed — key or IV may be corrupt:', err.message);
    return 'DECRYPTION_FAILED';
  }
}
