const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const db = require('../config/database');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Add completed column if missing (idempotent migration)
db.query(`ALTER TABLE calendar_notes ADD COLUMN completed INTEGER DEFAULT 0`).catch(() => {});

// Ensure note_comments table exists (private — never shown on dashboard)
db.query(`CREATE TABLE IF NOT EXISTS note_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  note_date TEXT NOT NULL,
  comment_text TEXT NOT NULL,
  color TEXT DEFAULT 'blue',
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now'))
)`).catch(() => {});

// Ensure note_files table exists
db.query(`CREATE TABLE IF NOT EXISTS note_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  note_date TEXT NOT NULL,
  original_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  created_at DATETIME DEFAULT (datetime('now'))
)`).catch(() => {});

// Multer for note uploads
const notesUploadDir = path.join(__dirname, '../../uploads/notes');
if (!fs.existsSync(notesUploadDir)) fs.mkdirSync(notesUploadDir, { recursive: true });

const noteStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, notesUploadDir),
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`)
});
const noteUpload = multer({
  storage: noteStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg','image/jpg','image/png','image/gif','image/webp','application/pdf',
      'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    cb(null, allowed.includes(file.mimetype));
  }
});

router.use(authenticate);

// GET /api/notes/date/2026-04-17
router.get('/date/:date', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM calendar_notes WHERE note_date = ? ORDER BY created_at ASC`,
      [req.params.date]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/notes?month=2026-04
router.get('/', async (req, res) => {
  try {
    const { month } = req.query; // e.g. "2026-04"
    let result;
    if (month) {
      result = await db.query(
        `SELECT * FROM calendar_notes WHERE note_date LIKE ? ORDER BY note_date ASC`,
        [`${month}%`]
      );
    } else {
      result = await db.query(
        `SELECT * FROM calendar_notes ORDER BY note_date DESC LIMIT 100`
      );
    }
    res.json(result.rows);
  } catch (err) {
    console.error('Notes get error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/notes
router.post('/', async (req, res) => {
  try {
    const { note_date, note_text, color = 'blue' } = req.body;
    if (!note_date || !note_text?.trim()) {
      return res.status(400).json({ error: 'Date and note text are required' });
    }
    const result = await db.query(
      `INSERT INTO calendar_notes (user_id, note_date, note_text, color) VALUES (?,?,?,?) RETURNING *`,
      [req.user.id, note_date, note_text.trim(), color]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Note create error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/notes/:id
router.put('/:id', async (req, res) => {
  try {
    const { note_text, color, note_date, completed } = req.body;
    const isAdmin = req.user.role === 'admin';
    const existing = await db.query(
      isAdmin
        ? 'SELECT * FROM calendar_notes WHERE id = ?'
        : 'SELECT * FROM calendar_notes WHERE id = ? AND user_id = ?',
      isAdmin ? [req.params.id] : [req.params.id, req.user.id]
    );
    if (!existing.rows[0]) return res.status(404).json({ error: 'Note not found' });
    await db.query(
      `UPDATE calendar_notes SET note_text = ?, color = ?, note_date = ?, completed = ?, updated_at = datetime('now') WHERE id = ?`,
      [
        note_text ?? existing.rows[0].note_text,
        color     ?? existing.rows[0].color,
        note_date ?? existing.rows[0].note_date,
        completed !== undefined ? (completed ? 1 : 0) : existing.rows[0].completed,
        req.params.id
      ]
    );
    const updated = await db.query('SELECT * FROM calendar_notes WHERE id = ?', [req.params.id]);
    res.json(updated.rows[0]);
  } catch (err) {
    console.error('Note update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/notes/:id
router.delete('/:id', async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const existing = await db.query(
      isAdmin
        ? 'SELECT id FROM calendar_notes WHERE id = ?'
        : 'SELECT id FROM calendar_notes WHERE id = ? AND user_id = ?',
      isAdmin ? [req.params.id] : [req.params.id, req.user.id]
    );
    if (!existing.rows[0]) return res.status(404).json({ error: 'Note not found' });
    await db.query('DELETE FROM calendar_notes WHERE id = ?', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('Note delete error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Note Comments (private — never shown on dashboard) ──

// GET /api/notes/comments/:date
router.get('/comments/:date', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM note_comments WHERE note_date = ? ORDER BY created_at ASC',
      [req.params.date]
    );
    res.json(result.rows);
  } catch { res.status(500).json({ error: 'Server error' }); }
});

// POST /api/notes/comments/:date
router.post('/comments/:date', async (req, res) => {
  try {
    const { comment_text, color = 'blue' } = req.body;
    if (!comment_text?.trim()) return res.status(400).json({ error: 'Comment text required' });
    const result = await db.query(
      `INSERT INTO note_comments (user_id, note_date, comment_text, color) VALUES (?,?,?,?) RETURNING *`,
      [req.user.id, req.params.date, comment_text.trim(), color]
    );
    res.status(201).json(result.rows[0]);
  } catch { res.status(500).json({ error: 'Server error' }); }
});

// PUT /api/notes/comments/:id
router.put('/comments/:id', async (req, res) => {
  try {
    const { comment_text } = req.body;
    const existing = await db.query(
      'SELECT * FROM note_comments WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (!existing.rows[0]) return res.status(404).json({ error: 'Not found' });
    await db.query(
      `UPDATE note_comments SET comment_text = ?, updated_at = datetime('now') WHERE id = ?`,
      [comment_text?.trim() ?? existing.rows[0].comment_text, req.params.id]
    );
    const updated = await db.query('SELECT * FROM note_comments WHERE id = ?', [req.params.id]);
    res.json(updated.rows[0]);
  } catch { res.status(500).json({ error: 'Server error' }); }
});

// DELETE /api/notes/comments/:id
router.delete('/comments/:id', async (req, res) => {
  try {
    const existing = await db.query(
      'SELECT id FROM note_comments WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (!existing.rows[0]) return res.status(404).json({ error: 'Not found' });
    await db.query('DELETE FROM note_comments WHERE id = ?', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

// GET /api/notes/files/:date — list files for a date
router.get('/files/:date', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM note_files WHERE note_date = ? ORDER BY created_at ASC',
      [req.params.date]
    );
    res.json(result.rows);
  } catch { res.status(500).json({ error: 'Server error' }); }
});

// POST /api/notes/files/:date — upload file
router.post('/files/:date', noteUpload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const result = await db.query(
      `INSERT INTO note_files (user_id, note_date, original_name, storage_path, mime_type) VALUES (?,?,?,?,?) RETURNING *`,
      [req.user.id, req.params.date, req.file.originalname, req.file.path, req.file.mimetype]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// GET /api/notes/files/download/:id
router.get('/files/download/:id', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM note_files WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    const file = result.rows[0];
    if (!file) return res.status(404).json({ error: 'File not found' });
    res.download(file.storage_path, file.original_name);
  } catch { res.status(500).json({ error: 'Server error' }); }
});

// DELETE /api/notes/files/:id
router.delete('/files/:id', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM note_files WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    const file = result.rows[0];
    if (!file) return res.status(404).json({ error: 'File not found' });
    if (fs.existsSync(file.storage_path)) fs.unlinkSync(file.storage_path);
    await db.query('DELETE FROM note_files WHERE id = ?', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
