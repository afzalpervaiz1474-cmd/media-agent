import crypto from 'node:crypto';

// AES-256-GCM at-rest encryption for user-provided API keys.
// KEY SOURCE PRIORITY:
//   1. AI_ENCRYPTION_KEY (base64 or hex, 32 bytes)
//   2. SUPABASE_SERVICE_ROLE_KEY (fallback so the app works without extra setup;
//      still server-only and never exposed to the client)
// Callers should still avoid storing extremely sensitive long-lived tokens
// without a dedicated key.

function getKey() {
  const raw = process.env.AI_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!raw) throw new Error('AI_ENCRYPTION_KEY (or SUPABASE_SERVICE_ROLE_KEY) must be set to encrypt secrets.');
  // Derive a stable 32-byte key from whatever was provided.
  return crypto.createHash('sha256').update(String(raw)).digest();
}

export function encryptSecret(plain) {
  if (plain == null || plain === '') return null;
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`;
}

export function decryptSecret(ciphertext) {
  if (!ciphertext) return null;
  const parts = String(ciphertext).split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('Invalid ciphertext format');
  const [, ivB64, tagB64, encB64] = parts;
  const key = getKey();
  const iv = Buffer.from(ivB64, 'base64url');
  const tag = Buffer.from(tagB64, 'base64url');
  const enc = Buffer.from(encB64, 'base64url');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString('utf8');
}

export function keyHint(plain) {
  if (!plain) return null;
  const s = String(plain);
  if (s.length <= 8) return `${s[0] || ''}***`;
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}
