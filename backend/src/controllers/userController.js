const bcrypt = require('bcryptjs');
const db = require('../config/database');

const getAllUsers = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, username, email, role, full_name, phone, department, is_active, last_login, created_at
       FROM users ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

const getUserById = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, username, email, role, full_name, phone, department, is_active, last_login, created_at
       FROM users WHERE id = ?`,
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

const createUser = async (req, res) => {
  try {
    const { username, email, password, role, full_name, phone, department } = req.body;
    if (!username || !email || !password || !role || !full_name) {
      return res.status(400).json({ error: 'Username, email, password, role, and full name are required' });
    }
    if (!['admin', 'manager', 'employee'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const existing = await db.query('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
    if (existing.rows.length > 0) return res.status(409).json({ error: 'Username or email already exists' });

    const hash = await bcrypt.hash(password, 12);
    const result = await db.query(
      `INSERT INTO users (username, email, password_hash, role, full_name, phone, department)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id, username, email, role, full_name, phone, department, is_active, created_at`,
      [username, email, hash, role, full_name, phone || null, department || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const fields = ['email','role','full_name','phone','department','is_active'];
    const setClauses = [`updated_at = datetime('now')`];
    const params = [];
    fields.forEach(f => {
      if (req.body[f] !== undefined) { setClauses.push(`${f} = ?`); params.push(req.body[f]); }
    });
    // Allow admin to reset a user's password
    if (req.body.new_password) {
      const hash = await bcrypt.hash(req.body.new_password, 12);
      setClauses.push('password_hash = ?');
      params.push(hash);
    }
    if (setClauses.length === 1) return res.status(400).json({ error: 'No fields to update' });
    params.push(id);
    await db.query(`UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`, params);
    const result = await db.query(
      'SELECT id, username, email, role, full_name, phone, department, is_active FROM users WHERE id = ?', [id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (String(id) === String(req.user.id)) return res.status(400).json({ error: 'Cannot delete yourself' });
    await db.query('DELETE FROM users WHERE id = ?', [id]);
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

const getUserPerformance = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
        u.id, u.full_name, u.role, u.department,
        COUNT(DISTINCT ps.project_id) as projects_assigned,
        SUM(CASE WHEN ps.status = 'completed' THEN 1 ELSE 0 END) as stages_completed,
        SUM(CASE WHEN ps.status = 'delayed' THEN 1 ELSE 0 END) as stages_delayed,
        AVG(CASE WHEN ps.status = 'completed' AND ps.start_time IS NOT NULL AND ps.end_time IS NOT NULL
            THEN (julianday(ps.end_time) - julianday(ps.start_time)) * 24
            END) as avg_stage_hours
       FROM users u
       LEFT JOIN project_stages ps ON ps.assigned_to = u.id
       GROUP BY u.id, u.full_name, u.role, u.department
       ORDER BY stages_completed DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getAllUsers, getUserById, createUser, updateUser, deleteUser, getUserPerformance };
