import express from 'express';
import {
  getAllUsers,
  createUser,
  updateUser,
  deleteUser,
} from '../controllers/userController.js';
import { authenticate, requireRole, requireUser } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticate);
router.use(requireUser);
router.use(requireRole('admin'));

router.get('/api/users', getAllUsers);
router.post('/api/users', createUser);
router.patch('/api/users/:id', updateUser);
router.delete('/api/users/:id', deleteUser);

export default router;
