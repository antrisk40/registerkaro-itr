import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import eventRoutes from './routes/eventRoutes.js';

// Load environment variables (e.g. MONGO_URI, WEBHOOK_SECRET)
dotenv.config();

const app = express();

// --- MIDDLEWARE ---
// Allow the Next.js frontend to connect without CORS errors
app.use(cors());

// Parse incoming JSON payloads (crucial for webhooks)
app.use(express.json());

// --- ROUTES ---
// Mount the event routes
app.use('/', eventRoutes);

// --- HEALTH CHECK ---
// Useful for ensuring the server is running on deployment platforms like Render or AWS
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Service is running smoothly.' });
});

// --- DATABASE AND SERVER STARTUP ---
const PORT = process.env.PORT || 4000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/registerkaro';

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
