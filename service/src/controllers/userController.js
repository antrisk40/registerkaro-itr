import bcrypt from 'bcryptjs';
import User from '../models/userSchema.js';

// Get all users
export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({}).select('-passwordHash').sort({ createdAt: -1 });
    return res.status(200).json(users);
  } catch (error) {
    console.error('[Users] Error fetching users:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Create a new user
export const createUser = async (req, res) => {
  try {
    const { username, password, displayName, role } = req.body;
    if (!username || !password || !displayName || !role) {
      return res.status(400).json({ error: 'All fields are required (username, password, displayName, role)' });
    }

    const trimmedUsername = username.trim().toLowerCase();
    const existingUser = await User.findOne({ username: trimmedUsername });
    if (existingUser) {
      return res.status(400).json({ error: 'Username is already taken' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = new User({
      username: trimmedUsername,
      passwordHash,
      displayName: displayName.trim(),
      role,
      active: true,
    });

    await user.save();

    const safeUser = user.toObject();
    delete safeUser.passwordHash;

    return res.status(201).json(safeUser);
  } catch (error) {
    console.error('[Users] Error creating user:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Update user (including ban/block and unban)
export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { displayName, role, active, password } = req.body;

    const updates = {};
    if (displayName !== undefined) updates.displayName = displayName.trim();
    if (role !== undefined) updates.role = role;
    if (active !== undefined) updates.active = active;
    if (password) {
      updates.passwordHash = await bcrypt.hash(password, 10);
    }

    const user = await User.findByIdAndUpdate(
      id,
      { $set: updates },
      { returnDocument: 'after' }
    ).select('-passwordHash');

    if (!user) return res.status(404).json({ error: 'User not found' });

    return res.status(200).json(user);
  } catch (error) {
    console.error('[Users] Error updating user:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Delete user
export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findByIdAndDelete(id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.status(200).json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('[Users] Error deleting user:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
