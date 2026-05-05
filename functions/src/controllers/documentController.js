const { db, bucket, docToObj, snapshotToArr, now, logAudit } = require('../config/firebase');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const uploadDocuments = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { stage_number, description } = req.body;

    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });

    let stageId = null;
    if (stage_number) {
      const stageSnap = await db.collection('project_stages')
        .where('project_id', '==', projectId)
        .where('stage_number', '==', parseInt(stage_number))
        .limit(1).get();
      stageId = stageSnap.empty ? null : stageSnap.docs[0].id;
    }

    const uploaded = [];
    for (const file of req.files) {
      const ext = path.extname(file.originalname);
      const storagePath = `documents/${projectId}/${uuidv4()}${ext}`;
      const fileRef = bucket.file(storagePath);
      await fileRef.save(file.buffer, { contentType: file.mimetype, metadata: { originalName: file.originalname } });

      const ref = await db.collection('documents').add({
        project_id: projectId, stage_id: stageId, stage_number: stage_number ? parseInt(stage_number) : null,
        file_name: `${uuidv4()}${ext}`, original_name: file.originalname,
        file_type: file.mimetype, file_size: file.size,
        storage_path: storagePath, description: description || null,
        uploaded_by: req.user.id, created_at: now()
      });
      const doc = await ref.get();
      uploaded.push(docToObj(doc));
    }

    await logAudit(req.user.id, 'DOCUMENT_UPLOADED', 'document', projectId, { count: uploaded.length, stage_number }, req.ip);
    res.status(201).json(uploaded);
  } catch (err) {
    console.error('Upload document error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getDocuments = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { stage_number } = req.query;

    let query = db.collection('documents').where('project_id', '==', projectId);
    if (stage_number) query = query.where('stage_number', '==', parseInt(stage_number));

    const snap = await query.orderBy('created_at', 'desc').get();
    const documents = snapshotToArr(snap);

    const userIds = [...new Set(documents.map(d => d.uploaded_by).filter(Boolean))];
    const userDocs = await Promise.all(userIds.map(id => db.collection('users').doc(id).get()));
    const userMap = {};
    userDocs.forEach(d => { if (d.exists) userMap[d.id] = d.data().full_name; });
    documents.forEach(d => { d.uploaded_by_name = userMap[d.uploaded_by] || null; });

    res.json(documents);
  } catch (err) {
    console.error('Get documents error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const downloadDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const docDoc = await db.collection('documents').doc(id).get();
    if (!docDoc.exists) return res.status(404).json({ error: 'Document not found' });

    const doc = docToObj(docDoc);
    const [buffer] = await bucket.file(doc.storage_path).download();

    res.setHeader('Content-Disposition', `attachment; filename="${doc.original_name}"`);
    res.setHeader('Content-Type', doc.file_type || 'application/octet-stream');
    res.send(buffer);
  } catch (err) {
    console.error('Download document error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const deleteDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const docDoc = await db.collection('documents').doc(id).get();
    if (!docDoc.exists) return res.status(404).json({ error: 'Document not found' });

    const doc = docToObj(docDoc);
    if (doc.uploaded_by !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ error: 'Not authorized' });

    await Promise.all([
      bucket.file(doc.storage_path).delete().catch(() => {}),
      db.collection('documents').doc(id).delete()
    ]);
    res.json({ message: 'Document deleted successfully' });
  } catch (err) {
    console.error('Delete document error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { uploadDocuments, getDocuments, downloadDocument, deleteDocument };
