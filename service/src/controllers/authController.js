import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/userSchema.js';

const signToken = (user) =>
  jwt.sign(
    { id: user._id.toString(), username: user.username, role: user.role, displayName: user.displayName },
    process.env.JWT_SECRET || 'dev-jwt-secret-change-me',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

export const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await User.findOne({ username: username.trim().toLowerCase(), active: true });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken(user);
    return res.status(200).json({
      token,
      user: {
        id: user._id.toString(),
        username: user.username,
        role: user.role,
        displayName: user.displayName,
      },
    });
  } catch (error) {
    console.error('[Auth] Login error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

export const me = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('username role displayName active').lean();
    if (!user || !user.active) return res.status(401).json({ error: 'Unauthorized' });
    return res.status(200).json({
      user: {
        id: user._id.toString(),
        username: user.username,
        role: user.role,
        displayName: user.displayName,
      },
    });
  } catch (error) {
    console.error('[Auth] Me error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
