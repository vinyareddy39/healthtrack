/**
 * RecoverTrack - Field-Level AES-256-GCM Encryption Service
 * 
 * SECURITY SPECIFICATION:
 * - Algorithm: AES-256-GCM (Authenticated Encryption with Associated Data)
 * - Key Length: 256 bits (32 bytes)
 * - Initialization Vector (IV): 12 bytes cryptographically secure random per field
 * - Authentication Tag: 16 bytes GCM auth tag
 * - Serialization Format: "enc:v1:<iv_hex>:<auth_tag_hex>:<ciphertext_hex>"
 * 
 * KEY ROTATION NOTE:
 * Version tag 'v1' prefix is included in serialized tokens.
 * To execute key rotation in production:
 * 1. Define SECONDARY_ENCRYPTION_KEY in .env with the new 256-bit key.
 * 2. Execute migration script: Read records, decrypt using PRIMARY_ENCRYPTION_KEY (v1),
 *    re-encrypt using SECONDARY_ENCRYPTION_KEY (tagged as v2), and save.
 * 3. Promote SECONDARY_ENCRYPTION_KEY to PRIMARY_ENCRYPTION_KEY and deprecate old key.
 */

const crypto = require('crypto');
const config = require('../config/env');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const CURRENT_VERSION = 'v1';

function getEncryptionKey() {
  const rawKey = config.ENCRYPTION_KEY;
  if (!rawKey) {
    throw new Error('FATAL: ENCRYPTION_KEY environment variable is not defined!');
  }
  // Convert 64-char hex string to 32-byte buffer, or SHA-256 hash if raw string
  if (rawKey.length === 64 && /^[0-9a-fA-F]+$/.test(rawKey)) {
    return Buffer.from(rawKey, 'hex');
  }
  return crypto.createHash('sha256').update(rawKey).digest();
}

/**
 * Encrypts a plaintext string into an authenticated AES-256-GCM string.
 * @param {string|number|null|undefined} text 
 * @returns {string|null}
 */
function encrypt(text) {
  if (text === null || text === undefined || text === '') {
    return text;
  }
  
  const strValue = String(text);
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(strValue, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `enc:${CURRENT_VERSION}:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts an authenticated AES-256-GCM string.
 * Safely handles unencrypted strings or empty values for backward compatibility.
 * @param {string|null|undefined} cipherText 
 * @returns {string|null}
 */
function decrypt(cipherText) {
  if (!cipherText || typeof cipherText !== 'string') {
    return cipherText;
  }

  // Check if string is encrypted with our prefix
  if (!cipherText.startsWith('enc:')) {
    return cipherText; // Non-encrypted pass-through
  }

  const parts = cipherText.split(':');
  if (parts.length !== 5) {
    return cipherText;
  }

  const [, version, ivHex, authTagHex, encryptedHex] = parts;

  try {
    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    // Authentication tag mismatch or corrupted ciphertext
    console.error('Decryption authentication failure for field:', err.message);
    return '[Decryption Error: Authentication Failed]';
  }
}

/**
 * Computes a deterministic HMAC-SHA256 hash of a normalized email
 * using the server's EMAIL_HASH_SECRET.
 * This enables exact-match uniqueness checks and indexing on encrypted email fields.
 * @param {string} email
 * @returns {string|null}
 */
function hashEmail(email) {
  if (!email || typeof email !== 'string') {
    return null;
  }
  const secret = config.EMAIL_HASH_SECRET;
  if (!secret) {
    throw new Error('FATAL: EMAIL_HASH_SECRET environment variable is not defined!');
  }
  const normalized = email.trim().toLowerCase();
  return crypto.createHmac('sha256', secret).update(normalized).digest('hex');
}

module.exports = {
  encrypt,
  decrypt,
  hashEmail,
  ALGORITHM,
  CURRENT_VERSION
};
