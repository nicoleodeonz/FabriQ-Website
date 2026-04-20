import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs/promises';

function getCloudinaryConfig() {
  const uploadBackend = String(process.env.UPLOAD_BACKEND || '').trim().toLowerCase();
  const cloudName = String(process.env.CLOUDINARY_CLOUD_NAME || '').trim();
  const apiKey = String(process.env.CLOUDINARY_API_KEY || '').trim();
  const apiSecret = String(process.env.CLOUDINARY_API_SECRET || '').trim();
  const folder = String(process.env.CLOUDINARY_FOLDER || 'fabriq').trim() || 'fabriq';

  return {
    uploadBackend,
    cloudName,
    apiKey,
    apiSecret,
    folder,
    isConfigured: uploadBackend === 'cloudinary' && Boolean(cloudName && apiKey && apiSecret),
  };
}

let cloudinaryInitialized = false;

function ensureCloudinaryConfigured() {
  const config = getCloudinaryConfig();
  if (!config.isConfigured) {
    return config;
  }

  if (!cloudinaryInitialized) {
    cloudinary.config({
      cloud_name: config.cloudName,
      api_key: config.apiKey,
      api_secret: config.apiSecret,
      secure: true,
    });
    cloudinaryInitialized = true;
  }

  return config;
}

async function removeLocalTempFile(filePath) {
  if (!filePath) return;

  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      console.warn('Failed to remove temporary upload:', error);
    }
  }
}

export function isCloudinaryEnabled() {
  return ensureCloudinaryConfigured().isConfigured;
}

export async function storeImageFromLocalPath(filePath, options = {}) {
  const config = ensureCloudinaryConfigured();
  if (!config.isConfigured) {
    throw new Error('Cloudinary is not configured.');
  }

  const targetFolder = [config.folder, options.folder].filter(Boolean).join('/');

  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: targetFolder,
      resource_type: 'image',
      use_filename: true,
      unique_filename: true,
      overwrite: false,
    });

    return {
      storage: 'cloudinary',
      url: result.secure_url,
      publicId: result.public_id,
    };
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Failed to upload image to Cloudinary.');
  }
}

export async function storeUploadedImage(file, options = {}) {
  const config = ensureCloudinaryConfigured();
  if (!file) {
    throw new Error('Uploaded file is required.');
  }

  if (!config.isConfigured) {
    return {
      storage: 'local',
      url: `/uploads/${file.filename}`,
      publicId: null,
    };
  }

  const targetFolder = [config.folder, options.folder].filter(Boolean).join('/');

  try {
    const result = await cloudinary.uploader.upload(file.path, {
      folder: targetFolder,
      resource_type: 'image',
      use_filename: true,
      unique_filename: true,
      overwrite: false,
    });

    await removeLocalTempFile(file.path);

    return {
      storage: 'cloudinary',
      url: result.secure_url,
      publicId: result.public_id,
    };
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Failed to upload image to Cloudinary.');
  }
}