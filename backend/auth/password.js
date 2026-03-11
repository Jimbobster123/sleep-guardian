import crypto from 'crypto';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 64;

function scryptAsync(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P }, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(derivedKey);
    });
  });
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derivedKey = await scryptAsync(password, salt);
  return `scrypt$${salt.toString('base64')}$${derivedKey.toString('base64')}`;
}

export async function verifyPassword(password, passwordHash) {
  try {
    const parts = String(passwordHash || '').split('$');
    if (parts.length !== 3) return false;
    const [alg, saltB64, hashB64] = parts;
    if (alg !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const actual = await scryptAsync(password, salt);
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

