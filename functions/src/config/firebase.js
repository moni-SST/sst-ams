const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
let _bucket = null;
const bucket = new Proxy({}, {
  get(_, prop) {
    if (!_bucket) _bucket = admin.storage().bucket('sst-application-system.firebasestorage.app');
    return _bucket[prop];
  }
});

// Convert Firestore doc to plain object with id
const docToObj = (doc) => {
  if (!doc.exists) return null;
  const data = doc.data();
  const obj = { id: doc.id, ...data };
  // Convert Timestamps to ISO strings
  for (const key of Object.keys(obj)) {
    if (obj[key] && typeof obj[key].toDate === 'function') {
      obj[key] = obj[key].toDate().toISOString().replace('T', ' ').substring(0, 19);
    }
  }
  return obj;
};

const snapshotToArr = (snapshot) => snapshot.docs.map(docToObj);

const now = () => admin.firestore.FieldValue.serverTimestamp();
const nowISO = () => new Date().toISOString().replace('T', ' ').substring(0, 19);

// Get next sequential ID for project numbers
const getNextProjectNumber = async () => {
  const year = new Date().getFullYear();
  const counterRef = db.collection('_counters').doc(`projects_${year}`);
  const newCount = await db.runTransaction(async (t) => {
    const doc = await t.get(counterRef);
    const count = (doc.exists ? doc.data().count : 0) + 1;
    t.set(counterRef, { count });
    return count;
  });
  return `SST-${year}-${String(newCount).padStart(4, '0')}`;
};

// Fetch user name by ID
const getUserName = async (userId) => {
  if (!userId) return null;
  const doc = await db.collection('users').doc(userId).get();
  return doc.exists ? doc.data().full_name : null;
};

// Batch fetch user names
const getUserNamesMap = async (userIds) => {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (!unique.length) return {};
  const docs = await Promise.all(unique.map(id => db.collection('users').doc(id).get()));
  const map = {};
  docs.forEach(doc => { if (doc.exists) map[doc.id] = doc.data().full_name; });
  return map;
};

// Log audit event
const logAudit = async (userId, action, entityType, entityId, newValues, ipAddress, userAgent) => {
  try {
    await db.collection('audit_logs').add({
      user_id: userId || null,
      action,
      entity_type: entityType || null,
      entity_id: entityId ? String(entityId) : null,
      new_values: newValues ? JSON.stringify(newValues) : null,
      ip_address: ipAddress || null,
      user_agent: userAgent || null,
      created_at: now()
    });
  } catch (e) { /* non-critical */ }
};

module.exports = { admin, db, bucket, docToObj, snapshotToArr, now, nowISO, getNextProjectNumber, getUserName, getUserNamesMap, logAudit };
