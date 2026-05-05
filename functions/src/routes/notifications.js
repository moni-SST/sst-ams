const router = require('express').Router();
const { db, snapshotToArr, now } = require('../config/firebase');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/', async (req, res) => {
  try {
    const snap = await db.collection('notifications')
      .where('user_id', '==', req.user.id)
      .orderBy('created_at', 'desc').limit(50).get();
    const notifications = snapshotToArr(snap);

    // Enrich with project numbers
    const projectIds = [...new Set(notifications.map(n => n.project_id).filter(Boolean))];
    const projectDocs = await Promise.all(projectIds.map(id => db.collection('projects').doc(id).get()));
    const projectMap = {};
    projectDocs.forEach(d => { if (d.exists) projectMap[d.id] = d.data().project_number; });
    notifications.forEach(n => { n.project_number = projectMap[n.project_id] || null; });

    const unread_count = notifications.filter(n => !n.is_read).length;
    res.json({ notifications, unread_count });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.patch('/read-all', async (req, res) => {
  try {
    const snap = await db.collection('notifications')
      .where('user_id', '==', req.user.id)
      .where('is_read', '==', false).get();
    const batch = db.batch();
    snap.docs.forEach(d => batch.update(d.ref, { is_read: true }));
    await batch.commit();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.patch('/:id/read', async (req, res) => {
  try {
    const doc = await db.collection('notifications').doc(req.params.id).get();
    if (doc.exists && doc.data().user_id === req.user.id) {
      await doc.ref.update({ is_read: true });
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
