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
