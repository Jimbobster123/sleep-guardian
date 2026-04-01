import pool from './db.js';

const MIME_TO_EXTENSION = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export async function getProfilePhotoUrl(userId) {
  const res = await pool.query('SELECT photo_url FROM "User" WHERE user_id = $1', [userId]);
  return res.rows[0]?.photo_url ?? null;
}

export async function saveProfilePhoto(userId, imageDataUrl) {
  if (typeof imageDataUrl !== 'string' || !imageDataUrl.startsWith('data:image/')) {
    throw new Error('Profile photo must be a valid image data URL');
  }

  const match = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Profile photo format is invalid');
  }

  const mimeType = match[1];
  const base64 = match[2];
  if (!MIME_TO_EXTENSION[mimeType]) {
    throw new Error('Only JPG, PNG, WEBP, and GIF profile photos are supported');
  }

  const buffer = Buffer.from(base64, 'base64');
  const maxBytes = 5 * 1024 * 1024;
  if (!buffer.length || buffer.length > maxBytes) {
    throw new Error('Profile photo must be between 1 byte and 5 MB');
  }

  await pool.query('UPDATE "User" SET photo_url = $1 WHERE user_id = $2', [imageDataUrl, userId]);

  return imageDataUrl;
}
