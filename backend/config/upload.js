import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const uploadDir = path.join(__dirname, '..', 'uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, unique);
  }
});

function createUpload(options) {
  const allowedExt = options.allowedExt.map((entry) => entry.toLowerCase());

  const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const hasAllowedExtension = allowedExt.includes(ext);

    // Some browsers/OS combinations report uncommon or blank MIME types for 3D assets.
    // Keep the extension gate strict and treat MIME only as advisory metadata.
    if (hasAllowedExtension) {
      cb(null, true);
    } else {
      cb(new Error(options.errorMessage));
    }
  };

  return multer({
    storage,
    fileFilter,
    limits: { fileSize: options.maxFileSize }
  });
}

const fileFilter = (req, file, cb) => {
  const allowedExt = ['.jpg', '.jpeg', '.png'];
  const allowedMime = ['image/jpeg', 'image/png'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExt.includes(ext) && allowedMime.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPG and PNG image files are allowed'));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5 MB
});

export const upload3DModel = createUpload({
  allowedExt: ['.glb', '.gltf', '.usdz', '.zip'],
  allowedMime: [
    'model/gltf-binary',
    'model/gltf_binary',
    'model/gltf+json',
    'model/vnd.usdz+zip',
    'model/vnd.pixar.usd',
    'model/usd',
    'application/zip',
    'application/x-zip-compressed',
    'application/octet-stream',
    'application/json',
    'text/plain'
  ],
  maxFileSize: 150 * 1024 * 1024,
  errorMessage: 'Only GLB, GLTF, USDZ, and ZIP model files are allowed'
});
