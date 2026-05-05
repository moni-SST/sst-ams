const { db, docToObj, snapshotToArr, now, logAudit } = require('../config/firebase');

const getPayments = async (req, res) => {
  try {
    const snap = await db.collection('payments')
      .where('project_id', '==', req.params.projectId)
      .orderBy('created_at', 'desc').get();
    const payments = snapshotToArr(snap);

    const userIds = [...new Set(payments.map(p => p.created_by).filter(Boolean))];
    const userDocs = await Promise.all(userIds.map(id => db.collection('users').doc(id).get()));
    const userMap = {};
    userDocs.forEach(d => { if (d.exists) userMap[d.id] = d.data().full_name; });
    payments.forEach(p => { p.created_by_name = userMap[p.created_by] || null; });

    res.json(payments);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

const createPayment = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { payment_type, amount, currency, status, due_date, received_date, notes, reference_number, payment_proof_doc_id } = req.body;
    if (!amount || !payment_type) return res.status(400).json({ error: 'Amount and payment type are required' });

    const ref = await db.collection('payments').add({
      project_id: projectId, payment_type, amount: parseFloat(amount),
      currency: currency || 'INR', status: status || 'pending',
      due_date: due_date || null, received_date: received_date || null,
      notes: notes || null, reference_number: reference_number || null,
      payment_proof_doc_id: payment_proof_doc_id || null,
      created_by: req.user.id, created_at: now(), updated_at: now()
    });

    const doc = await ref.get();
    const payment = docToObj(doc);
    await logAudit(req.user.id, 'PAYMENT_CREATED', 'payment', payment.id, { amount, payment_type, status }, req.ip);
    res.status(201).json(payment);
  } catch (err) {
    console.error('Create payment error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const updatePayment = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await db.collection('payments').doc(id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Payment not found' });

    const updates = { updated_at: now() };
    ['payment_type','amount','currency','status','due_date','received_date','notes','reference_number','payment_proof_doc_id']
      .forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

    await db.collection('payments').doc(id).update(updates);
    const updated = await db.collection('payments').doc(id).get();
    res.json(docToObj(updated));
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

const getPaymentSummary = async (req, res) => {
  try {
    const snap = await db.collection('payments').where('project_id', '==', req.params.projectId).get();
    const payments = snapshotToArr(snap);

    const summary = {
      total_received: 0, total_pending: 0, total_overdue: 0,
      total_amount: 0, total_payments: payments.length
    };
    payments.forEach(p => {
      const amt = parseFloat(p.amount) || 0;
      summary.total_amount += amt;
      if (p.status === 'received') summary.total_received += amt;
      if (p.status === 'pending') summary.total_pending += amt;
      if (p.status === 'overdue') summary.total_overdue += amt;
    });
    res.json(summary);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

module.exports = { getPayments, createPayment, updatePayment, getPaymentSummary };
