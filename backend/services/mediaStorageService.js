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

function isCloudinaryFileSizeLimitError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('file size too large') || message.includes('maximum is 10485760');
}

function uploadLargeToCloudinary(filePath, options) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_large(filePath, options, (error, result) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(result);
    });
  });
}

function getUploadErrorMessage(error, fallback) {
  return String(error?.message || (error instanceof Error ? error.message : error) || fallback);
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

    const uploadedUrl = result.secure_url || result.url;
    if (!uploadedUrl) {
      throw new Error('Cloudinary returned no URL for the uploaded asset.');
    }

    return {
      storage: 'cloudinary',
      url: uploadedUrl,
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

    const uploadedUrl = result.secure_url || result.url;
    if (!uploadedUrl) {
      throw new Error('Cloudinary returned no URL for the uploaded asset.');
    }

    await removeLocalTempFile(file.path);

    return {
      storage: 'cloudinary',
      url: uploadedUrl,
      publicId: result.public_id,
    };
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Failed to upload image to Cloudinary.');
  }
}

export async function storeAssetFromLocalPath(filePath, options = {}) {
  const config = ensureCloudinaryConfigured();
  if (!config.isConfigured) {
    throw new Error('Cloudinary is not configured.');
  }

  const resourceType = options.resourceType || 'raw';
  const targetFolder = [config.folder, options.folder].filter(Boolean).join('/');

  try {
    const result = await uploadLargeToCloudinary(filePath, {
      folder: targetFolder,
      resource_type: resourceType,
      chunk_size: 6 * 1024 * 1024,
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
    throw new Error(getUploadErrorMessage(error, 'Failed to upload asset to Cloudinary.'));
  }
}

export async function storeUploadedAsset(file, options = {}) {
  const config = ensureCloudinaryConfigured();
  if (!file) {
    throw new Error('Uploaded file is required.');
  }

  if (!config.isConfigured) {
    await removeLocalTempFile(file.path);
    throw new Error('Cloudinary is not configured for asset uploads.');
  }

  const resourceType = options.resourceType || 'raw';
  const targetFolder = [config.folder, options.folder].filter(Boolean).join('/');

  try {
    const uploadOptions = {
      folder: targetFolder,
      resource_type: resourceType,
      use_filename: true,
      unique_filename: true,
      overwrite: false,
    };

    const result = await uploadLargeToCloudinary(file.path, {
      ...uploadOptions,
      chunk_size: 6 * 1024 * 1024,
    });

    const uploadedUrl = String(result?.secure_url || '').trim();
    if (!uploadedUrl || !/^https:\/\/res\.cloudinary\.com\//i.test(uploadedUrl)) {
      throw new Error('Cloudinary returned no valid secure URL for the uploaded asset.');
    }

    await removeLocalTempFile(file.path);

    return {
      storage: 'cloudinary',
      url: uploadedUrl,
      publicId: result.public_id,
    };
  } catch (error) {
    await removeLocalTempFile(file.path);
    throw new Error(getUploadErrorMessage(error, 'Failed to upload asset to Cloudinary.'));
  }
}
