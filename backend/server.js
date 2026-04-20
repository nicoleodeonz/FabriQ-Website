import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadEnvironment } from './config/loadEnv.js';
import { connectDB } from './config/database.js';
import customerRoutes from './routes/customers.js';
import authRoutes from './routes/auth.js';
import inventoryRoutes from './routes/inventory.js';
import userRoutes from './routes/users.js';
import rentalRoutes from './routes/rentals.js';
import appointmentRoutes from './routes/appointments.js';
import customOrderRoutes from './routes/customOrders.js';

loadEnvironment();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 5000;
const frontendBuildDir = path.resolve(__dirname, '../frontend/build');
const frontendIndexPath = path.join(frontendBuildDir, 'index.html');
const hasFrontendBuild = fs.existsSync(frontendIndexPath);

// Parse CORS origins from environment variable
const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:3001,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:3001,http://[::1]:3000,http://[::1]:3001').split(',').map(origin => origin.trim());

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
app.use('/api/rentals', rentalRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/custom-orders', customOrderRoutes);

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running' });
});

if (hasFrontendBuild) {
  app.use(express.static(frontendBuildDir));

  app.get(/^(?!\/api|\/uploads).*/, (req, res) => {
    res.sendFile(frontendIndexPath);
  });
} else {
  // Keep a plain root response available when the frontend build is not present.
  app.get('/', (req, res) => {
    res.send('FabriQ backend is running');
  });
}

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
