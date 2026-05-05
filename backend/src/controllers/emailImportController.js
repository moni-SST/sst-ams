const imapSimple = require('imap-simple');
const { simpleParser } = require('mailparser');
const db = require('../config/database');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const ALLOWED_EXTS = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.xls', '.xlsx', '.doc', '.docx'];

// POST /api/email-import/fetch
// Body: { email, password, host?, port?, tls?, limit? }
const fetchEmailAttachments = async (req, res) => {
  const { email, password, host, port, tls, limit = 10 } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const config = {
    imap: {
      user: email,
      password,
      host: host || 'imap.gmail.com',
      port: port || 993,
      tls: tls !== false,
      tlsOptions: { rejectUnauthorized: false },
      authTimeout: 10000,
    },
  };

  let connection;
  try {
    connection = await imapSimple.connect(config);
    await connection.openBox('INBOX');

    const messages = await connection.search(['ALL'], {
      bodies: [''],
      markSeen: false,
    });

    const recent = messages.slice(-Math.min(limit, 50)).reverse();
    const results = [];

    for (const msg of recent) {
      const raw = msg.parts.find(p => p.which === '');
      if (!raw) continue;

      const parsed = await simpleParser(raw.body);
      if (!parsed.attachments || parsed.attachments.length === 0) continue;

      const validAttachments = parsed.attachments.filter(att => {
        const ext = path.extname(att.filename || '').toLowerCase();
        return ALLOWED_EXTS.includes(ext) || ALLOWED_TYPES.includes(att.contentType);
      });

      if (validAttachments.length === 0) continue;

      results.push({
        subject: parsed.subject || '(No subject)',
        from: parsed.from?.text || '',
        date: parsed.date,
        attachments: validAttachments.map(att => ({
          id: uuidv4(),
          filename: att.filename,
          size: att.size,
          contentType: att.contentType,
          // Store base64 content temporarily for import step
          content: att.content.toString('base64'),
        })),
      });
    }

    connection.end();
    res.json({ emails: results });
  } catch (err) {
    if (connection) try { connection.end(); } catch (_) {}
    console.error('IMAP fetch error:', err.message);
    if (err.message?.includes('Invalid credentials') || err.message?.includes('Authentication failed')) {
      return res.status(401).json({ error: 'Invalid email or password. For Gmail, use an App Password.' });
    }
    res.status(500).json({ error: err.message || 'Failed to connect to email' });
  }
};

// POST /api/email-import/import
// Body: { projectId, stageNumber, attachments: [{ filename, contentType, content (base64) }] }
const importAttachments = async (req, res) => {
  const { projectId, stageNumber, attachments } = req.body;

  if (!projectId || !attachments || !attachments.length) {
    return res.status(400).json({ error: 'projectId and attachments are required' });
  }

  const uploadDir = path.join(__dirname, '../../uploads', String(projectId));
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  const stageResult = stageNumber
    ? await db.query('SELECT id FROM project_stages WHERE project_id = $1 AND stage_number = $2', [projectId, stageNumber])
    : null;
  const stageId = stageResult?.rows[0]?.id || null;

  const uploaded = [];
  for (const att of attachments) {
    const ext = path.extname(att.filename || '').toLowerCase() || '.bin';
    const uniqueName = `${uuidv4()}${ext}`;
    const filePath = path.join(uploadDir, uniqueName);

    const buffer = Buffer.from(att.content, 'base64');
    fs.writeFileSync(filePath, buffer);

    const storagePath = filePath.replace(/\\/g, '/');
    const result = await db.query(
      `INSERT INTO documents (project_id, stage_id, stage_number, file_name, original_name, file_type, file_size, storage_path, description, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [projectId, stageId, stageNumber || null, uniqueName, att.filename,
       att.contentType, buffer.length, storagePath, 'Imported from email', req.user.id]
    );
    uploaded.push(result.rows[0]);
  }

  await db.query(
    "INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values, ip_address) VALUES ($1, 'DOCUMENT_UPLOADED', 'document', $2, $3, $4)",
    [req.user.id, parseInt(projectId), JSON.stringify({ count: uploaded.length, stage_number: stageNumber, source: 'email' }), req.ip]
  );

  res.status(201).json(uploaded);
};

module.exports = { fetchEmailAttachments, importAttachments };
