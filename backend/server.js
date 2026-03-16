import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB } from './config/database.js';
import customerRoutes from './routes/customers.js';
import authRoutes from './routes/auth.js';
import inventoryRoutes from './routes/inventory.js';
import userRoutes from './routes/users.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 5000;

// Parse CORS origins from environment variable
const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3001,http://localhost:5173,http://localhost:5713,http://127.0.0.1:3001,http://[::1]:3001').split(',').map(origin => origin.trim());

// Middleware
app.use(cors({
  origin: corsOrigins,
  credentials: true
}));
app.use(express.json());

// Connect to MongoDB
connectDB();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/users', userRoutes);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
