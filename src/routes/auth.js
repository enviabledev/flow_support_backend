const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config/database');
const StaffModel = require('../models/staff');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const staff = await StaffModel.findByEmail(email);
    if (!staff) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!staff.is_active) {
      return res.status(401).json({ error: 'Account is deactivated' });
    }

    const validPassword = await bcrypt.compare(password, staff.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: staff.id, name: staff.name, email: staff.email, role: staff.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const refreshToken = jwt.sign(
      { id: staff.id, type: 'refresh' },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({
      token,
      refreshToken,
      user: {
        id: staff.id,
        name: staff.name,
        email: staff.email,
        role: staff.role,
        avatar_url: staff.avatar_url
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    if (decoded.type !== 'refresh') {
      return res.status(403).json({ error: 'Invalid token type' });
    }

    const staff = await StaffModel.findById(decoded.id);
    if (!staff || !staff.is_active) {
      return res.status(401).json({ error: 'Invalid or inactive account' });
    }

    const token = jwt.sign(
      { id: staff.id, name: staff.name, email: staff.email, role: staff.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token });
  } catch (error) {
    res.status(403).json({ error: 'Invalid refresh token' });
  }
});

router.get('/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

router.post('/fcm-token', authenticateToken, async (req, res) => {
  try {
    const { token } = req.body;
    console.log(`FCM token registration: user=${req.user.name}, token=${token ? token.substring(0, 30) + '...' : 'NULL'}`);
    if (!token) return res.status(400).json({ error: 'Token required' });
    // Add token to array if not already present (supports multi-device)
    await pool.query(
      `UPDATE staff SET fcm_tokens = array_append(
        array_remove(COALESCE(fcm_tokens, '{}'), $1), $1
      ), fcm_token = $1 WHERE id = $2`,
      [token, req.user.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('FCM token update error:', error);
    res.status(500).json({ error: 'Failed to update FCM token' });
  }
});

router.post('/staff', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, email, password, role = 'agent' } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password required' });
    }

    const existing = await StaffModel.findByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'Email already in use' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const staff = await StaffModel.create({
      id: uuidv4(),
      name,
      email,
      password_hash,
      role
    });

    res.status(201).json({ staff });
  } catch (error) {
    console.error('Create staff error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
