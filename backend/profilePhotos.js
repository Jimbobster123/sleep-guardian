import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_PHOTO_DIR = path.join(__dirname, 'uploads', 'profile-photos');

const MIME_TO_EXTENSION = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

async function ensurePhotoDir() {
  await fs.mkdir(PROFILE_PHOTO_DIR, { recursive: true });
}

export async function getExistingProfilePhotoFilename(userId) {
  await ensurePhotoDir();
  const files = await fs.readdir(PROFILE_PHOTO_DIR);
  const prefix = `${userId}.`;
  return files.find((file) => file.startsWith(prefix)) || null;
}

export async function getProfilePhotoUrl(userId) {
  const file = await getExistingProfilePhotoFilename(userId);
  return file ? `/uploads/profile-photos/${file}` : null;
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
  const extension = MIME_TO_EXTENSION[mimeType];
  if (!extension) {
    throw new Error('Only JPG, PNG, WEBP, and GIF profile photos are supported');
  }

  const buffer = Buffer.from(base64, 'base64');
  const maxBytes = 5 * 1024 * 1024;
  if (!buffer.length || buffer.length > maxBytes) {
    throw new Error('Profile photo must be between 1 byte and 5 MB');
  }

  await ensurePhotoDir();

  const existing = await getExistingProfilePhotoFilename(userId);
  if (existing) {
    await fs.unlink(path.join(PROFILE_PHOTO_DIR, existing)).catch(() => {});
  }

  const filename = `${userId}.${extension}`;
  await fs.writeFile(path.join(PROFILE_PHOTO_DIR, filename), buffer);

  return `/uploads/profile-photos/${filename}?t=${Date.now()}`;
}
