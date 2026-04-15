import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Storage abstraction for file uploads (logos, etc.)
 *
 * Supports two backends controlled by STORAGE_BACKEND env var:
 *   - 'local'  : disk storage under /uploads (default, dev only)
 *   - 's3'     : S3-compatible object storage (Render, production)
 *
 * For S3 backend, set: S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID,
 * S3_SECRET_ACCESS_KEY, and optionally S3_ENDPOINT (for R2, MinIO, etc.)
 * and S3_PUBLIC_URL (for CDN/custom domain).
 */

const BACKEND = process.env.STORAGE_BACKEND || 'local';

// ── Local disk backend ──────────────────────────────────────────────────────

const LOCAL_UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'logos');

async function ensureLocalDir() {
  try {
    await fs.mkdir(LOCAL_UPLOAD_DIR, { recursive: true });
  } catch { /* already exists */ }
}

async function localUpload(buffer, filename) {
  await ensureLocalDir();
  const filePath = path.join(LOCAL_UPLOAD_DIR, filename);
  await fs.writeFile(filePath, buffer);
  return `/uploads/logos/${filename}`;
}

async function localDelete(fileUrl) {
  if (!fileUrl) return;
  const filePath = path.join(__dirname, '..', fileUrl.replace(/^\//, ''));
  await fs.unlink(filePath).catch(() => {});
}

// ── S3-compatible backend ───────────────────────────────────────────────────

let s3ClientPromise = null;

function getS3Client() {
  if (s3ClientPromise) return s3ClientPromise;
  s3ClientPromise = import('@aws-sdk/client-s3').then(({ S3Client }) => {
    return new S3Client({
      region: process.env.S3_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      },
      ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true } : {}),
    });
  });
  return s3ClientPromise;
}

async function s3Upload(buffer, filename, contentType) {
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  const client = await getS3Client();
  const bucket = process.env.S3_BUCKET;
  const key = `logos/${filename}`;

  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000',
  }));

  const publicBase = process.env.S3_PUBLIC_URL
    || `https://${bucket}.s3.${process.env.S3_REGION || 'us-east-1'}.amazonaws.com`;
  return `${publicBase}/${key}`;
}

async function s3Delete(fileUrl) {
  if (!fileUrl) return;
  try {
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await getS3Client();
    const bucket = process.env.S3_BUCKET;
    const url = new URL(fileUrl);
    const key = url.pathname.replace(/^\//, '');
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (err) {
    logger.error(`Failed to delete S3 object: ${fileUrl}`, err);
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Upload a file buffer to storage.
 * @param {Buffer} buffer - File contents
 * @param {string} filename - Destination filename
 * @param {string} contentType - MIME type
 * @returns {string} Public URL for the uploaded file
 */
export async function uploadFile(buffer, filename, contentType) {
  if (BACKEND === 's3') {
    return s3Upload(buffer, filename, contentType);
  }
  return localUpload(buffer, filename);
}

/**
 * Delete a file from storage by its URL.
 * @param {string} fileUrl - URL returned by uploadFile
 */
export async function deleteFile(fileUrl) {
  if (BACKEND === 's3') {
    return s3Delete(fileUrl);
  }
  return localDelete(fileUrl);
}

export function getBackendType() {
  return BACKEND;
}
