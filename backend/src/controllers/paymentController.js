const db = require('../config/database');

const getPayments = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT p.*, u.full_name as created_by_name, d.original_name as proof_doc_name
       FROM payments p
       LEFT JOIN users u ON p.created_by = u.id
       LEFT JOIN documents d ON p.payment_proof_doc_id = d.id
       WHERE p.project_id = ? ORDER BY p.created_at DESC`,
      [req.params.projectId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

const createPayment = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { payment_type, amount, currency, status, due_date, received_date, notes, reference_number, payment_proof_doc_id } = req.body;
    if (!amount || !payment_type) return res.status(400).json({ error: 'Amount and payment type are required' });

    const result = await db.query(
      `INSERT INTO payments (project_id, payment_type, amount, currency, status, due_date, received_date, notes, reference_number, payment_proof_doc_id, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?) RETURNING *`,
      [projectId, payment_type, amount, currency || 'INR', status || 'pending',
       due_date || null, received_date || null, notes || null,
       reference_number || null, payment_proof_doc_id || null, req.user.id]
    );

    await db.query(
      "INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values, ip_address) VALUES (?, 'PAYMENT_CREATED', 'payment', ?, ?, ?)",
      [req.user.id, result.rows[0].id, JSON.stringify({ amount, payment_type, status }), req.ip]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create payment error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const updatePayment = async (req, res) => {
  try {
    const { id } = req.params;
    const fields = ['payment_type','amount','currency','status','due_date','received_date','notes','reference_number','payment_proof_doc_id'];
    const setClauses = [`updated_at = datetime('now')`];
    const params = [];
    fields.forEach(f => { if (req.body[f] !== undefined) { setClauses.push(`${f} = ?`); params.push(req.body[f]); } });
    params.push(id);
    await db.query(`UPDATE payments SET ${setClauses.join(', ')} WHERE id = ?`, params);
    const result = await db.query('SELECT * FROM payments WHERE id = ?', [id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Payment not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

const getPaymentSummary = async (req, res) => {
  try {
    const result = await db.query(
      `SELECT
        COALESCE(SUM(CASE WHEN status='received' THEN amount ELSE 0 END),0) as total_received,
        COALESCE(SUM(CASE WHEN status='pending' THEN amount ELSE 0 END),0) as total_pending,
        COALESCE(SUM(CASE WHEN status='overdue' THEN amount ELSE 0 END),0) as total_overdue,
        COALESCE(SUM(amount),0) as total_amount,
        COUNT(*) as total_payments
       FROM payments WHERE project_id = ?`,
      [req.params.projectId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getPayments, createPayment, updatePayment, getPaymentSummary };
