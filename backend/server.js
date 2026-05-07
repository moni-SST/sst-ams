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
