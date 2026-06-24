import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import eventRoutes from './routes/eventRoutes.js';
import jobRoutes from './routes/jobRoutes.js';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from service/.env (explicit path so CWD doesn't matter)
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();

// --- MIDDLEWARE ---
const corsOptions = {
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'OPTIONS', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Last-Event-ID'],
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Parse incoming JSON payloads (crucial for webhooks)
app.use(express.json());

// --- ROUTES ---
app.use('/', authRoutes);
app.use('/', userRoutes);
app.use('/', eventRoutes);
app.use('/', jobRoutes);

// --- GLOBAL ERROR HANDLER ---
// Captures any unhandled exceptions in routes or middleware and prevents server crashes
app.use((err, req, res, next) => {
  console.error('[Global Error Handler] Caught an unexpected error:', err.stack || err);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

// --- HEALTH CHECK ---
// Useful for ensuring the server is running on deployment platforms like Render or AWS
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Service is running smoothly.' });
});

// --- DATABASE AND SERVER STARTUP ---
const PORT = process.env.PORT || 4000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/registerkaro';

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('[MongoDB] Connected successfully.');
    app.listen(PORT, () => {
      console.log(`[Express] Server listening on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[MongoDB] Connection error:', err);
    process.exit(1);
  });
