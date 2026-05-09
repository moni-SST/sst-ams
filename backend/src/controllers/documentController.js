const db = require('../config/database');
const path = require('path');
const fs = require('fs');
const { sendDocumentUploadEmail } = require('../config/email');
const { v4: uuidv4 } = require('uuid');
const cloudinarySvc = require('../config/cloudinary');

const uploadDocuments = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { stage_number, description, notify_email } = req.body;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const useCloudinary = cloudinarySvc.isEnabled();
    const uploaded = [];
    for (const file of req.files) {
      const stageResult = stage_number
        ? await db.query('SELECT id FROM project_stages WHERE project_id = $1 AND stage_number = $2', [projectId, stage_number])
        : null;

      const stageId = stageResult?.rows[0]?.id || null;
      let storagePath, fileName;

      if (useCloudinary) {
        const ext = path.extname(file.originalname).toLowerCase();
        const publicId = `sst-ams/projects/${projectId}/${uuidv4()}`;
        const result = await cloudinarySvc.uploadBuffer(file.buffer, {
          public_id: publicId,
          resource_type: 'auto',
          // raw resource type for non-image/video files (PDF, doc, xlsx)
          ...(['.pdf','.doc','.docx','.xls','.xlsx','.msg'].includes(ext) ? { resource_type: 'raw' } : {}),
        });
        storagePath = result.secure_url; // full https URL
        fileName = result.public_id;     // store public_id for deletion later
      } else {
        storagePath = file.path.replace(/\\/g, '/');
        fileName = file.filename;
      }

      const result = await db.query(
        `INSERT INTO documents (project_id, stage_id, stage_number, file_name, original_name, file_type, file_size, storage_path, description, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [projectId, stageId, stage_number || null, fileName, file.originalname,
         file.mimetype, file.size, storagePath, description || null, req.user.id]
      );
      uploaded.push(result.rows[0]);
    }

    await db.query(
      "INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values, ip_address) VALUES ($1, 'DOCUMENT_UPLOADED', 'document', $2, $3, $4)",
      [req.user.id, parseInt(projectId), JSON.stringify({ count: uploaded.length, stage_number }), req.ip]
    );

    if (notify_email) {
      try {
        const projRes = await db.query('SELECT name FROM projects WHERE id = $1', [projectId]);
        const userRes = await db.query('SELECT full_name FROM users WHERE id = $1', [req.user.id]);
        await sendDocumentUploadEmail({
          to: notify_email,
          projectName: projRes.rows[0]?.name || `Project ${projectId}`,
          stageNumber: stage_number || 'N/A',
          files: req.files.map(f => f.originalname),
          uploadedBy: userRes.rows[0]?.full_name || 'A user',
        });
      } catch (emailErr) {
        console.error('Email send error:', emailErr.message);
      }
    }

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

    let query = `
      SELECT d.*, u.full_name as uploaded_by_name
      FROM documents d
      LEFT JOIN users u ON d.uploaded_by = u.id
      WHERE d.project_id = $1
    `;
    const params = [projectId];

    if (stage_number) {
      query += ' AND d.stage_number = $2';
      params.push(stage_number);
    }

    query += ' ORDER BY d.created_at DESC';
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Get documents error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const downloadDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT * FROM documents WHERE id = $1', [id]);

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = result.rows[0];

    // Cloudinary URL → stream the remote file through, preserving original filename
    if (/^https?:\/\//i.test(doc.storage_path)) {
      const url = doc.storage_path + (doc.storage_path.includes('?') ? '&' : '?') + 'fl_attachment';
      const remote = await fetch(url);
      if (!remote.ok) return res.status(502).json({ error: 'Cloud file fetch failed' });
      res.setHeader('Content-Type', doc.file_type || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${doc.original_name}"`);
      const buffer = Buffer.from(await remote.arrayBuffer());
      return res.send(buffer);
    }

    // Local file
    const filePath = path.isAbsolute(doc.storage_path)
      ? doc.storage_path
      : path.join(__dirname, '../../', doc.storage_path);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found on server' });
    }

    res.download(filePath, doc.original_name);
  } catch (err) {
    console.error('Download document error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const deleteDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT * FROM documents WHERE id = $1', [id]);

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Only uploader or admin can delete
    if (result.rows[0].uploaded_by !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized to delete this document' });
    }

    const doc = result.rows[0];
    const isCloudUrl = /^https?:\/\//i.test(doc.storage_path);

    if (isCloudUrl && cloudinarySvc.isEnabled() && doc.file_name) {
      // file_name holds the Cloudinary public_id for cloud-hosted files
      const ext = path.extname(doc.original_name).toLowerCase();
      const resourceType = ['.pdf','.doc','.docx','.xls','.xlsx','.msg'].includes(ext) ? 'raw' : 'auto';
      try {
        await cloudinarySvc.destroy(doc.file_name, { resource_type: resourceType });
      } catch (e) { console.error('Cloudinary destroy:', e.message); }
    } else if (!isCloudUrl) {
      const filePath = path.isAbsolute(doc.storage_path)
        ? doc.storage_path
        : path.join(__dirname, '../../', doc.storage_path);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await db.query('DELETE FROM documents WHERE id = $1', [id]);
    res.json({ message: 'Document deleted successfully' });
  } catch (err) {
    console.error('Delete document error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { uploadDocuments, getDocuments, downloadDocument, deleteDocument };
