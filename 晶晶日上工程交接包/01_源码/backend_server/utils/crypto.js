// utils/crypto.js - 敏感字段加解密
const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const KEY = Buffer.from(process.env.FIELD_ENC_KEY || 'dev_field_enc_key_32bytes_pad!!', 'utf8').slice(0, 32);

function encrypt(plaintext) {
  if (!plaintext) return '';
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  let enc = cipher.update(String(plaintext), 'utf8', 'hex');
  enc += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${tag}:${enc}`;
}

function decrypt(ciphertext) {
  if (!ciphertext) return '';
  try {
    const [ivHex, tagHex, enc] = ciphertext.split(':');
    const decipher = crypto.createDecipheriv(ALGO, KEY, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    let dec = decipher.update(enc, 'hex', 'utf8');
    dec += decipher.final('utf8');
    return dec;
  } catch (e) {
    return '';
  }
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

module.exports = { encrypt, decrypt, maskPhone, maskIdCard, maskBankCard, hashPassword, verifyPassword };
