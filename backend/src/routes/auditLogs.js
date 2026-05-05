const router = require('express').Router();
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

router.use(authenticate, authorize('admin', 'manager'));

router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50, action, user_id } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = [];
    const params = [];

    if (action) { conditions.push('al.action = ?'); params.push(action); }
    if (user_id) { conditions.push('al.user_id = ?'); params.push(user_id); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [result, countResult] = await Promise.all([
      db.query(
        `SELECT al.*, u.full_name, u.username FROM audit_logs al
         LEFT JOIN users u ON al.user_id = u.id
         ${where} ORDER BY al.created_at DESC LIMIT ? OFFSET ?`,
        [...params, parseInt(limit), offset]
      ),
      db.query(
        `SELECT COUNT(*) as count FROM audit_logs al ${where}`,
        params
      )
    ]);

    res.json({
      logs: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page)
    });
  } catch (err) {
    console.error('Audit log error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE all audit logs — admin only
router.delete('/clear', authorize('admin'), async (req, res) => {
  try {
    await db.query('DELETE FROM audit_logs');
    res.json({ message: 'All audit logs cleared' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
