import express from 'express';
import { login, me } from '../controllers/authController.js';
import { authenticate, requireUser } from '../middleware/auth.js';

const router = express.Router();

router.post('/api/auth/login', login);
router.get('/api/auth/me', authenticate, requireUser, me);

export default router;
