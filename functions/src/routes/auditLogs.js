const router = require('express').Router();
const { db, docToObj, snapshotToArr } = require('../config/firebase');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

router.use(authenticate, authorize('admin', 'manager'));

router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50, action } = req.query;
    let snap = await db.collection('audit_logs').orderBy('created_at', 'desc').get();
    let logs = snapshotToArr(snap);

    if (action) logs = logs.filter(l => l.action === action);

    const total = logs.length;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const paginated = logs.slice(offset, offset + parseInt(limit));

    // Enrich with user info
    const userIds = [...new Set(paginated.map(l => l.user_id).filter(Boolean))];
    const userDocs = await Promise.all(userIds.map(id => db.collection('users').doc(id).get()));
    const userMap = {};
    userDocs.forEach(d => { if (d.exists) { userMap[d.id] = { full_name: d.data().full_name, username: d.data().username }; } });
    paginated.forEach(l => {
      l.full_name = userMap[l.user_id]?.full_name || null;
      l.username = userMap[l.user_id]?.username || null;
    });

    res.json({ logs: paginated, total, page: parseInt(page) });
  } catch (err) {
    console.error('Audit log error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/clear', authorize('admin'), async (req, res) => {
  try {
    const snap = await db.collection('audit_logs').get();
    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    res.json({ message: 'All audit logs cleared' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
