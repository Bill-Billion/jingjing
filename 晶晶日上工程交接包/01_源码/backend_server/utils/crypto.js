// utils/crypto.js - 敏感字段加解密
const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
function fieldError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function createFieldCipher(env = process.env) {
  if (!env.FIELD_ENC_KEY) throw fieldError('FIELD_ENCRYPTION_NOT_CONFIGURED');
  if (typeof env.FIELD_ENC_KEY !== 'string' || Buffer.byteLength(env.FIELD_ENC_KEY, 'utf8') !== 32) {
    throw fieldError('FIELD_ENCRYPTION_KEY_INVALID');
  }
  const key = Buffer.from(env.FIELD_ENC_KEY, 'utf8');
  return {
    encrypt(plaintext) {
      if (plaintext === null || plaintext === undefined || plaintext === '') return '';
      if (typeof plaintext !== 'string') throw fieldError('FIELD_PLAINTEXT_INVALID');
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv(ALGO, key, iv);
      const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
      return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${enc.toString('hex')}`;
    },
    decrypt(ciphertext) {
      if (ciphertext === null || ciphertext === undefined || ciphertext === '') return '';
      if (typeof ciphertext !== 'string' || !/^[a-f0-9]{24}:[a-f0-9]{32}:(?:[a-f0-9]{2})+$/i.test(ciphertext)) {
        throw fieldError('FIELD_CIPHERTEXT_INVALID');
      }
      const [iv, tag, enc] = ciphertext.split(':');
      try {
        const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(iv, 'hex'));
        decipher.setAuthTag(Buffer.from(tag, 'hex'));
        return Buffer.concat([decipher.update(Buffer.from(enc, 'hex')), decipher.final()]).toString('utf8');
      } catch {
        throw fieldError('FIELD_DECRYPTION_FAILED');
      }
    },
  };
}

// Capture one configured key per process; changes require a restart and explicit migration.
let defaultCipher;
function assertFieldEncryptionConfigured() {
  if (!defaultCipher) defaultCipher = createFieldCipher();
}
function encrypt(plaintext) {
  assertFieldEncryptionConfigured();
  return defaultCipher.encrypt(plaintext);
}
function decrypt(ciphertext) {
  assertFieldEncryptionConfigured();
  return defaultCipher.decrypt(ciphertext);
}

function maskPhone(phone) {
  if (!phone || phone.length < 7) return phone;
  return phone.slice(0, 3) + '****' + phone.slice(-4);
}

function maskIdCard(id) {
  if (!id || id.length < 8) return id;
  return id.slice(0, 4) + '**********' + id.slice(-4);
}

function maskBankCard(card) {
  if (!card || card.length < 8) return card;
  return card.slice(0, 4) + ' **** **** ' + card.slice(-4);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const test = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(test, 'hex'));
}

module.exports = { createFieldCipher, assertFieldEncryptionConfigured, encrypt, decrypt, maskPhone, maskIdCard, maskBankCard, hashPassword, verifyPassword };
