const bcrypt = require('bcryptjs');
const { db, docToObj, snapshotToArr, now } = require('../config/firebase');

const getAllUsers = async (req, res) => {
  try {
    const snap = await db.collection('users').orderBy('created_at', 'desc').get();
    const users = snapshotToArr(snap).map(u => {
      const { password_hash, ...safe } = u;
      return safe;
    });
    res.json(users);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

const getUserById = async (req, res) => {
  try {
    const doc = await db.collection('users').doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: 'User not found' });
    const { password_hash, ...safe } = docToObj(doc);
    res.json(safe);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

const createUser = async (req, res) => {
  try {
    const { username, email, password, role, full_name, phone, department } = req.body;
    if (!username || !email || !password || !role || !full_name)
      return res.status(400).json({ error: 'Username, email, password, role, and full name are required' });
    if (!['admin', 'manager', 'employee'].includes(role))
      return res.status(400).json({ error: 'Invalid role' });

    const [uSnap, eSnap] = await Promise.all([
      db.collection('users').where('username', '==', username).limit(1).get(),
      db.collection('users').where('email', '==', email).limit(1).get()
    ]);
    if (!uSnap.empty || !eSnap.empty) return res.status(409).json({ error: 'Username or email already exists' });

    const hash = await bcrypt.hash(password, 12);
    const ref = await db.collection('users').add({
      username, email, password_hash: hash, role, full_name,
      phone: phone || null, department: department || null,
      is_active: true, last_login: null, created_at: now(), updated_at: now()
    });
    const newDoc = await ref.get();
    const { password_hash, ...safe } = docToObj(newDoc);
    res.status(201).json(safe);
  } catch (err) {
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await db.collection('users').doc(id).get();
    if (!doc.exists) return res.status(404).json({ error: 'User not found' });

    const updates = { updated_at: now() };
    ['email','role','full_name','phone','department','is_active'].forEach(f => {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    });
    if (req.body.username) {
      const uSnap = await db.collection('users').where('username', '==', req.body.username).limit(1).get();
      if (!uSnap.empty && uSnap.docs[0].id !== id)
        return res.status(409).json({ error: 'Username already taken' });
      updates.username = req.body.username;
    }
    if (req.body.new_password) {
      updates.password_hash = await bcrypt.hash(req.body.new_password, 12);
    }
    await db.collection('users').doc(id).update(updates);
    const updated = await db.collection('users').doc(id).get();
    const { password_hash, ...safe } = docToObj(updated);
    res.json(safe);
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (id === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
    await db.collection('users').doc(id).delete();
    res.json({ message: 'User deleted' });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
};

const getUserPerformance = async (req, res) => {
  try {
    const [usersSnap, stagesSnap] = await Promise.all([
      db.collection('users').get(),
      db.collection('project_stages').get()
    ]);
    const users = snapshotToArr(usersSnap);
    const stages = snapshotToArr(stagesSnap);

    const result = users.map(u => {
      const userStages = stages.filter(s => s.assigned_to === u.id);
      const completed = userStages.filter(s => s.status === 'completed');
      const delayed = userStages.filter(s => s.status === 'delayed');
      const projectIds = [...new Set(userStages.map(s => s.project_id))];

      let avgHours = null;
      const timedStages = completed.filter(s => s.start_time && s.end_time);
      if (timedStages.length > 0) {
        const totalHours = timedStages.reduce((sum, s) => {
          const diff = (new Date(s.end_time) - new Date(s.start_time)) / (1000 * 60 * 60);
          return sum + diff;
        }, 0);
        avgHours = totalHours / timedStages.length;
      }

      return {
        id: u.id, full_name: u.full_name, role: u.role, department: u.department,
        projects_assigned: projectIds.length,
        stages_completed: completed.length,
        stages_delayed: delayed.length,
        avg_stage_hours: avgHours
      };
    }).sort((a, b) => b.stages_completed - a.stages_completed);

    res.json(result);
  } catch (err) {
    console.error('Performance error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getAllUsers, getUserById, createUser, updateUser, deleteUser, getUserPerformance };
