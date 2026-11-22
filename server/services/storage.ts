import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { getPersistentStorageDir, type DbTx } from '../db/client.ts';
import { toSqlTimestamp } from './security.ts';

export type UploadEntityType = 'product_image' | 'store_logo' | 'store_banner' | 'seller_document' | 'editorial_image';

export interface StoredFileMeta {
  mediaId: string;
  storageDriver: 'local' | 's3';
  storageKey: string;
  publicUrl: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
}

export interface StorageAdapter {
  readonly driverName: 'local' | 's3';
  isConfigured(): boolean;
  saveValidatedFile(params: {
    buffer: Buffer;
    originalMime: string;
    entityType: UploadEntityType;
    entityId?: string;
    ownerUserId: string;
  }): Promise<Omit<StoredFileMeta, 'mediaId'>>;
  resolveLocalPath(storageKey: string): string | null;
}

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

function detectMagicType(buf: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf' | null {
  if (buf.length < 12) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  // WEBP: RIFF....WEBP
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp';
  }
  // PDF: %PDF-
  if (buf.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  return null;
}

class LocalDiskStorageAdapter implements StorageAdapter {
  readonly driverName = 'local' as const;

  getUploadsRoot(): string {
    const dir = path.join(getPersistentStorageDir(), 'uploads');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  isConfigured(): boolean {
    return true;
  }

  async saveValidatedFile(params: {
    buffer: Buffer;
    originalMime: string;
    entityType: UploadEntityType;
    entityId?: string;
    ownerUserId: string;
  }): Promise<Omit<StoredFileMeta, 'mediaId'>> {
    if (params.buffer.length === 0 || params.buffer.length > MAX_UPLOAD_BYTES) {
      throw new Error('File must be between 1 byte and 5 MB.');
    }

    const detected = detectMagicType(params.buffer);
    if (!detected) {
      throw new Error('Unsupported file signature. Only JPEG, PNG, WebP images (and PDF for KYC) are accepted.');
    }

    if (detected === 'application/pdf' && params.entityType !== 'seller_document') {
      throw new Error('PDF uploads are permitted only for seller KYC documents.');
    }

    const root = this.getUploadsRoot();
    const safeSubdir = params.entityType.replace(/[^a-z_]/g, '');
    const targetDir = path.join(root, safeSubdir);
    fs.mkdirSync(targetDir, { recursive: true });

    const id = crypto.randomUUID();
    if (detected === 'application/pdf') {
      const storageKey = `${safeSubdir}/${id}.pdf`;
      const absPath = this.resolveLocalPath(storageKey);
      if (!absPath) throw new Error('Invalid storage path.');
      await fs.promises.writeFile(absPath, params.buffer);
      return {
        storageDriver: 'local',
        storageKey,
        publicUrl: `/uploads/${storageKey}`,
        mimeType: 'application/pdf',
        sizeBytes: params.buffer.length,
        width: null,
        height: null,
      };
    }

    // Re-encode raster image via sharp (strips EXIF/GPS & prevents embedded payloads)
    const pipeline = sharp(params.buffer)
      .rotate()
      .resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 84 });

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    const storageKey = `${safeSubdir}/${id}.webp`;
    const absPath = this.resolveLocalPath(storageKey);
    if (!absPath) throw new Error('Invalid storage path.');
    await fs.promises.writeFile(absPath, data);

    return {
      storageDriver: 'local',
      storageKey,
      publicUrl: `/uploads/${storageKey}`,
      mimeType: 'image/webp',
      sizeBytes: data.length,
      width: info.width,
      height: info.height,
    };
  }

  resolveLocalPath(storageKey: string): string | null {
    const clean = storageKey.replace(/^\/+/, '');
    if (clean.includes('..') || !/^[a-z_]+\/[a-f0-9-]+\.(webp|pdf)$/i.test(clean)) {
      return null;
    }
    const root = this.getUploadsRoot();
    const resolved = path.resolve(root, clean);
    if (!resolved.startsWith(root + path.sep)) return null;
    return resolved;
  }
}

class S3StorageAdapterStub implements StorageAdapter {
  readonly driverName = 's3' as const;

  isConfigured(): boolean {
    return Boolean(
      process.env.S3_ENDPOINT &&
        process.env.S3_BUCKET &&
        process.env.S3_ACCESS_KEY &&
        process.env.S3_SECRET_KEY
    );
  }

  async saveValidatedFile(): Promise<Omit<StoredFileMeta, 'mediaId'>> {
    throw new Error('Needs my input: configure S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, and S3_SECRET_KEY.');
  }

  resolveLocalPath(): string | null {
    return null;
  }
}

const localAdapter = new LocalDiskStorageAdapter();
const s3Adapter = new S3StorageAdapterStub();

export function getStorageAdapter(): StorageAdapter {
  if ((process.env.STORAGE_DRIVER || '').toLowerCase() === 's3' && s3Adapter.isConfigured()) {
    return s3Adapter;
  }
  return localAdapter;
}

export function getStorageStatus() {
  return {
    activeDriver: getStorageAdapter().driverName,
    persistentDir: getPersistentStorageDir(),
    s3Configured: s3Adapter.isConfigured(),
  };
}

export async function saveUploadedMedia(
  db: DbTx,
  input: {
    base64Data: string;
    mimeType: string;
    entityType: UploadEntityType;
    entityId?: string;
    ownerUserId: string;
    folder?: string;
    alt?: { en: string; ar: string } | null;
    focalX?: number;
    focalY?: number;
  }
): Promise<StoredFileMeta> {
  const stripped = input.base64Data.replace(/^data:[^;]+;base64,/, '').trim();
  const buffer = Buffer.from(stripped, 'base64');
  const adapter = getStorageAdapter();
  const saved = await adapter.saveValidatedFile({
    buffer,
    originalMime: input.mimeType,
    entityType: input.entityType,
    entityId: input.entityId,
    ownerUserId: input.ownerUserId,
  });

  const mediaId = `med-${crypto.randomUUID()}`;
  const folder = (input.folder || input.entityType || 'general').replace(/[^a-z0-9_-]/gi, '').slice(0, 60) || 'general';
  const focalX = Math.max(0, Math.min(100, Math.round(input.focalX ?? 50)));
  const focalY = Math.max(0, Math.min(100, Math.round(input.focalY ?? 50)));

  await db.execute(
    `INSERT INTO media (id, owner_user_id, entity_type, entity_id, folder, storage_driver, storage_key, public_url, mime_type, size_bytes, width, height, alt_json, focal_x, focal_y, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      mediaId,
      input.ownerUserId,
      input.entityType,
      input.entityId || null,
      folder,
      saved.storageDriver,
      saved.storageKey,
      saved.publicUrl,
      saved.mimeType,
      saved.sizeBytes,
      saved.width,
      saved.height,
      input.alt ? JSON.stringify(input.alt) : null,
      focalX,
      focalY,
      toSqlTimestamp(),
    ]
  );

  return { mediaId, ...saved };
}
