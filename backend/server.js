import express from 'express';
import cors from 'cors';
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
import notificationRoutes from './routes/notifications.js';

loadEnvironment();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 5000;

const defaultCorsOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://[::1]:3000',
  'http://[::1]:3001',
  'https://hannahvanessa.com',
  'https://www.hannahvanessa.com'
];

const corsOrigins = Array.from(
  new Set(
    [
      ...defaultCorsOrigins,
      ...String(process.env.CORS_ORIGIN || '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
    ]
  )
);

// Middleware
app.use(cors({
  origin(origin, callback) {
    if (!origin || corsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`Origin ${origin} is not allowed by CORS`));
  },
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
app.use('/api/notifications', notificationRoutes);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/custom-orders', customOrderRoutes);

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running' });
});

app.get('/', (req, res) => {
  res.send('FabriQ backend is running');
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
