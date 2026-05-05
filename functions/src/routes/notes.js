const router = require('express').Router();
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { db, bucket, docToObj, snapshotToArr, now } = require('../config/firebase');
const { authenticate } = require('../middleware/auth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg','image/jpg','image/png','image/gif','image/webp','application/pdf',
      'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    cb(null, allowed.includes(file.mimetype));
  }
});

router.use(authenticate);

// Calendar notes
router.get('/date/:date', async (req, res) => {
  try {
    const snap = await db.collection('calendar_notes').where('note_date', '==', req.params.date).orderBy('created_at').get();
    res.json(snapshotToArr(snap));
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.get('/', async (req, res) => {
  try {
    const { month } = req.query;
    let snap;
    if (month) {
      const start = `${month}-01`, end = `${month}-99`;
      snap = await db.collection('calendar_notes').where('note_date', '>=', start).where('note_date', '<=', end).orderBy('note_date').get();
    } else {
      snap = await db.collection('calendar_notes').orderBy('note_date', 'desc').limit(100).get();
    }
    res.json(snapshotToArr(snap));
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.post('/', async (req, res) => {
  try {
    const { note_date, note_text, color = 'blue' } = req.body;
    if (!note_date || !note_text?.trim()) return res.status(400).json({ error: 'Date and note text are required' });
    const ref = await db.collection('calendar_notes').add({
      user_id: req.user.id, note_date, note_text: note_text.trim(), color, completed: false, created_at: now(), updated_at: now()
    });
    const doc = await ref.get();
    res.status(201).json(docToObj(doc));
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.put('/:id', async (req, res) => {
  try {
    const { note_text, color, note_date, completed } = req.body;
    const doc = await db.collection('calendar_notes').doc(req.params.id).get();
    if (!doc.exists || doc.data().user_id !== req.user.id) return res.status(404).json({ error: 'Note not found' });
    const updates = { updated_at: now() };
    if (note_text !== undefined) updates.note_text = note_text;
    if (color !== undefined) updates.color = color;
    if (note_date !== undefined) updates.note_date = note_date;
    if (completed !== undefined) updates.completed = Boolean(completed);
    await doc.ref.update(updates);
    const updated = await doc.ref.get();
    res.json(docToObj(updated));
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const doc = await db.collection('calendar_notes').doc(req.params.id).get();
    if (!doc.exists || doc.data().user_id !== req.user.id) return res.status(404).json({ error: 'Note not found' });
    await doc.ref.delete();
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// Note comments
router.get('/comments/:date', async (req, res) => {
  try {
    const snap = await db.collection('note_comments').where('note_date', '==', req.params.date).orderBy('created_at').get();
    res.json(snapshotToArr(snap));
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.post('/comments/:date', async (req, res) => {
  try {
    const { comment_text, color = 'blue' } = req.body;
    if (!comment_text?.trim()) return res.status(400).json({ error: 'Comment text required' });
    const ref = await db.collection('note_comments').add({
      user_id: req.user.id, note_date: req.params.date, comment_text: comment_text.trim(), color, created_at: now(), updated_at: now()
    });
    const doc = await ref.get();
    res.status(201).json(docToObj(doc));
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.put('/comments/:id', async (req, res) => {
  try {
    const { comment_text } = req.body;
    const doc = await db.collection('note_comments').doc(req.params.id).get();
    if (!doc.exists || doc.data().user_id !== req.user.id) return res.status(404).json({ error: 'Not found' });
    await doc.ref.update({ comment_text: comment_text?.trim() || doc.data().comment_text, updated_at: now() });
    const updated = await doc.ref.get();
    res.json(docToObj(updated));
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.delete('/comments/:id', async (req, res) => {
  try {
    const doc = await db.collection('note_comments').doc(req.params.id).get();
    if (!doc.exists || doc.data().user_id !== req.user.id) return res.status(404).json({ error: 'Not found' });
    await doc.ref.delete();
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// Note file attachments
router.get('/files/:date', async (req, res) => {
  try {
    const snap = await db.collection('note_files').where('note_date', '==', req.params.date).orderBy('created_at').get();
    res.json(snapshotToArr(snap));
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.post('/files/:date', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const ext = path.extname(req.file.originalname);
    const storagePath = `note_files/${req.params.date}/${uuidv4()}${ext}`;
    await bucket.file(storagePath).save(req.file.buffer, { contentType: req.file.mimetype });
    const ref = await db.collection('note_files').add({
      user_id: req.user.id, note_date: req.params.date,
      original_name: req.file.originalname, storage_path: storagePath,
      mime_type: req.file.mimetype, created_at: now()
    });
    const doc = await ref.get();
    res.status(201).json(docToObj(doc));
  } catch (err) { res.status(500).json({ error: 'Upload failed' }); }
});

router.get('/files/download/:id', async (req, res) => {
  try {
    const doc = await db.collection('note_files').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'File not found' });
    const file = docToObj(doc);
    const [buffer] = await bucket.file(file.storage_path).download();
    res.setHeader('Content-Disposition', `attachment; filename="${file.original_name}"`);
    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.send(buffer);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.delete('/files/:id', async (req, res) => {
  try {
    const doc = await db.collection('note_files').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'File not found' });
    const file = docToObj(doc);
    await Promise.all([
      bucket.file(file.storage_path).delete().catch(() => {}),
      doc.ref.delete()
    ]);
    res.json({ message: 'Deleted' });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
