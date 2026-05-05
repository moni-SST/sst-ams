const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: true, credentials: true }));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 1000 });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use(limiter);
app.use('/api/auth/login', authLimiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/stages', require('./routes/stages'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/users', require('./routes/users'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/audit-logs', require('./routes/auditLogs'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/notes', require('./routes/notes'));

app.get('/api/health', (req, res) => res.json({ status: 'OK', timestamp: new Date().toISOString() }));

// Init endpoint — creates admin/manager on first run
app.post('/api/init', async (req, res) => {
  try {
    const { db, now } = require('./config/firebase');
    const bcrypt = require('bcryptjs');
    const snap = await db.collection('users').limit(1).get();
    if (!snap.empty) return res.json({ message: 'Already initialized' });

    const adminHash = await bcrypt.hash('Admin@123', 12);
    const managerHash = await bcrypt.hash('Manager@123', 12);
    await Promise.all([
      db.collection('users').add({ username: 'admin', email: 'admin@sst.com', password_hash: adminHash, role: 'admin', full_name: 'System Administrator', is_active: true, created_at: now(), updated_at: now() }),
      db.collection('users').add({ username: 'manager1', email: 'manager@sst.com', password_hash: managerHash, role: 'manager', full_name: 'Project Manager', department: 'Engineering', is_active: true, created_at: now(), updated_at: now() })
    ]);
    res.json({ message: 'Initialized! admin/Admin@123, manager1/Manager@123' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Temporary password reset endpoint
app.post('/api/reset-admin', async (req, res) => {
  try {
    const { secret } = req.body;
    if (secret !== 'SST_RESET_2024') return res.status(403).json({ error: 'Forbidden' });
    const { db } = require('./config/firebase');
    const bcrypt = require('bcryptjs');
    const snap = await db.collection('users').where('username', '==', 'admin').limit(1).get();
    if (snap.empty) return res.status(404).json({ error: 'Admin not found' });
    const hash = await bcrypt.hash('admin@123', 12);
    await snap.docs[0].ref.update({ password_hash: hash });
    res.json({ message: 'Admin password reset to admin@123' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Temporary: set usernames for users who don't have one
app.post('/api/set-usernames', async (req, res) => {
  try {
    const { secret } = req.body;
    if (secret !== 'SST_RESET_2024') return res.status(403).json({ error: 'Forbidden' });
    const { db } = require('./config/firebase');
    const snap = await db.collection('users').get();
    const updates = [];
    for (const doc of snap.docs) {
      const data = doc.data();
      if (!data.username) {
        const username = data.full_name.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
        updates.push({ id: doc.id, username, full_name: data.full_name });
        await doc.ref.update({ username });
      }
    }
    res.json({ message: 'Usernames set', updates });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: 'Internal server error' });
});

module.exports = app;
