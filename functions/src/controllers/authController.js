const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db, docToObj, snapshotToArr, now, logAudit } = require('../config/firebase');
const { JWT_SECRET } = require('../middleware/auth');

const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });

    // Find user by username or email
    const snap = await db.collection('users')
      .where('username', '==', username.trim())
      .where('is_active', '==', true)
      .limit(1).get();

    let userDoc = snap.docs[0];
    if (!userDoc) {
      // Try by email
      const emailSnap = await db.collection('users')
        .where('email', '==', username.trim())
        .where('is_active', '==', true)
        .limit(1).get();
      userDoc = emailSnap.docs[0];
    }

    if (!userDoc) return res.status(401).json({ error: 'Invalid credentials' });

    const user = { id: userDoc.id, ...userDoc.data() };
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      await logAudit(user.id, 'LOGIN_FAILED', 'auth', null, null, req.ip);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
    await db.collection('users').doc(user.id).update({ last_login: now() });
    await logAudit(user.id, 'LOGIN', 'auth', null, null, req.ip, req.get('user-agent'));

    res.json({
      token,
      user: { id: user.id, username: user.username, email: user.email, role: user.role, full_name: user.full_name, department: user.department }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getMe = (req, res) => res.json({ user: req.user });

const changeUsername = async (req, res) => {
  try {
    const { new_username } = req.body;
    if (!new_username || !new_username.trim()) return res.status(400).json({ error: 'New username required' });
    const username = new_username.trim().toLowerCase().replace(/\s+/g, '');
    if (username.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters' });

    const snap = await db.collection('users').where('username', '==', username).limit(1).get();
    if (!snap.empty && snap.docs[0].id !== req.user.id)
      return res.status(409).json({ error: 'Username already taken' });

    await db.collection('users').doc(req.user.id).update({ username });
    await logAudit(req.user.id, 'USERNAME_CHANGED', 'auth', null, null, req.ip);
    res.json({ message: 'Username changed successfully', username });
  } catch (err) {
    console.error('Change username error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const changePassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) return res.status(400).json({ error: 'Both passwords required' });
    if (new_password.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters' });

    const userDoc = await db.collection('users').doc(req.user.id).get();
    const isMatch = await bcrypt.compare(current_password, userDoc.data().password_hash);
    if (!isMatch) return res.status(400).json({ error: 'Current password is incorrect' });

    const hash = await bcrypt.hash(new_password, 12);
    await db.collection('users').doc(req.user.id).update({ password_hash: hash });
    await logAudit(req.user.id, 'PASSWORD_CHANGED', 'auth', null, null, req.ip);
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { login, getMe, changePassword, changeUsername };
