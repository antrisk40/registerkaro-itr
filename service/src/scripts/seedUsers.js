import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import User from '../models/userSchema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const USERS = [
  {
    username: 'admin',
    displayName: 'Administrator',
    role: 'admin',
    password: process.env.ADMIN_PASSWORD || 'admin123',
  },
  {
    username: 'spoc',
    displayName: 'SPOC User',
    role: 'spoc',
    password: process.env.SPOC_PASSWORD || 'spoc123',
  },
];

const seed = async () => {
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/registerkaro';
  await mongoose.connect(mongoUri);
  console.log('[Seed] Connected to MongoDB');

  for (const entry of USERS) {
    const passwordHash = await bcrypt.hash(entry.password, 10);
    const user = await User.findOneAndUpdate(
      { username: entry.username },
      {
        username: entry.username,
        displayName: entry.displayName,
        role: entry.role,
        passwordHash,
        active: true,
      },
      { upsert: true, returnDocument: 'after' }
    );
    console.log(`[Seed] ${user.role} user "${user.username}" ready (${entry.password})`);
  }

  await mongoose.disconnect();
  console.log('[Seed] Done');
};

seed().catch((err) => {
  console.error('[Seed] Failed:', err);
  process.exit(1);
});
