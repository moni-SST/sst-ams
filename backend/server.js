require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

const allowedOrigins = [
  'http://localhost:5173',
  'https://southsmart-technologies-web.web.app',
  'https://southsmart-technologies-web.firebaseapp.com',
  'https://sst-application-system.web.app',
  'https://sst-application-system.firebaseapp.com',
  process.env.CLIENT_URL
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin) || origin.endsWith('.ngrok-free.app') || origin.endsWith('.ngrok.io')),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { error: 'Too many requests, please try again later.' }
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many login attempts, please try again later.' }
});

app.use('/api/', limiter);
app.use('/api/auth/login', authLimiter);

// Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// Static files for uploads — clear frame-blocking headers so PDFs render in iframes
app.use('/uploads', (req, res, next) => {
  res.removeHeader('X-Frame-Options');
  res.setHeader('Content-Security-Policy', "frame-ancestors *");
  next();
}, express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/projects', require('./src/routes/projects'));
app.use('/api/stages', require('./src/routes/stages'));
app.use('/api/documents', require('./src/routes/documents'));
app.use('/api/payments', require('./src/routes/payments'));
app.use('/api/users', require('./src/routes/users'));
app.use('/api/analytics', require('./src/routes/analytics'));
app.use('/api/audit-logs', require('./src/routes/auditLogs'));
app.use('/api/notifications', require('./src/routes/notifications'));
app.use('/api/notes', require('./src/routes/notes'));
app.use('/api/email-import', require('./src/routes/emailImport'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Migration endpoint disabled
app.post('/api/migrate-data-disabled', async (req, res) => {
  const secret = req.headers['x-migrate-secret'];
  if (secret !== 'sst-migrate-2026') return res.status(403).json({ error: 'Forbidden' });
  const db = require('./src/config/database');
  const bcrypt = require('bcryptjs');
  const { users, projects, project_stages, documents, payments, calendar_notes } = req.body;
  const results = {};
  try {
    // Users
    for (const u of (users || [])) {
      try {
        await db.query(`INSERT INTO users (id, username, email, password_hash, role, full_name, department, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING`,
          [u.id, u.username, u.email, u.password_hash, u.role, u.full_name, u.department, u.is_active ?? 1, u.created_at]);
      } catch(e) { console.log('user skip:', e.message); }
    }
    results.users = users?.length;

    // Projects (only columns that exist in schema-pg.sql)
    for (const p of (projects || [])) {
      try {
        await db.query(`INSERT INTO projects (id, project_number, customer_name, company_name, communication_type, customer_type, reference, description, priority, status, current_stage, progress_percentage, assigned_manager, total_value, expected_end_date, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT (id) DO NOTHING`,
          [p.id, p.project_number, p.customer_name, p.company_name, p.communication_type, p.customer_type, p.reference, p.description, p.priority, p.status, p.current_stage, p.progress_percentage, p.assigned_manager, p.total_value, p.expected_end_date, p.created_by, p.created_at, p.updated_at]);
      } catch(e) { console.log('project skip:', e.message); }
    }
    results.projects = projects?.length;

    // Stages
    for (const s of (project_stages || [])) {
      try {
        const stageName = s.stage_name || ['Customer Requirement','Customer Name & Company','Communication','Customer Type','Company Details','NDA','Customer Design Requirement','SST Design + Quotation','Negotiation','Purchase Order','PO Acknowledgement','Terms & Advance','Payment Received','Project Execution','Delivery + Invoice','Installation & Commissioning','Project Sign Up','Balance Payment','Project Closed'][s.stage_number - 1] || 'Stage ' + s.stage_number;
        await db.query(`INSERT INTO project_stages (id, project_id, stage_number, stage_name, status, updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT (id) DO NOTHING`,
          [s.id, s.project_id, s.stage_number, stageName, s.status, s.updated_at]);
      } catch(e) { console.log('stage skip:', e.message); }
    }
    results.stages = project_stages?.length;

    // Calendar notes
    for (const n of (calendar_notes || [])) {
      try {
        await db.query(`INSERT INTO calendar_notes (id, user_id, note_date, note_text, color, completed, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT (id) DO NOTHING`,
          [n.id, n.user_id, n.note_date, n.note_text, n.color, n.completed ?? 0, n.created_at, n.updated_at]);
      } catch(e) { console.log('note skip:', e.message); }
    }
    results.notes = calendar_notes?.length;

    // Sequence reset for PostgreSQL
    if (process.env.DATABASE_URL) {
      const tables = ['users','projects','project_stages','documents','payments','calendar_notes'];
      for (const t of tables) {
        try { await db.query(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), COALESCE((SELECT MAX(id) FROM ${t}), 1))`); } catch(e) {}
      }
    }

    res.json({ success: true, migrated: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`AMS Server running on port ${PORT}`);
});

module.exports = app;
