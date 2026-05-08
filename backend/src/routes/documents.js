const router = require('express').Router();
const { uploadDocuments, getDocuments, downloadDocument, deleteDocument } = require('../controllers/documentController');
const { authenticate } = require('../middleware/auth');
const upload = require('../config/multer');
const db = require('../config/database');
const path = require('path');
const fs = require('fs');

router.use(authenticate);

// Specific routes first (before dynamic /:projectId)
router.get('/download/:id', downloadDocument);

// Convert document to Word or Excel
router.get('/convert/:id/:format', async (req, res) => {
  const { format } = req.params;
  if (!['docx', 'xlsx'].includes(format)) return res.status(400).json({ error: 'Unsupported format' });

  try {
    const result = await db.query('SELECT * FROM documents WHERE id = ?', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Document not found' });

    const doc = result.rows[0];
    const ext = doc.original_name.split('.').pop().toLowerCase();
    const baseName = doc.original_name.replace(/\.[^.]+$/, '');

    const filePath = path.isAbsolute(doc.storage_path)
      ? doc.storage_path
      : path.join(__dirname, '../../', doc.storage_path);
    const fileExists = fs.existsSync(filePath);

    // ── Excel → real .xlsx using exceljs ─────────────────────────────────────
    if (format === 'xlsx') {
      if ((ext === 'xlsx' || ext === 'xls') && fileExists) {
        res.setHeader('Content-Disposition', `attachment; filename="${baseName}.${ext}"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        return res.sendFile(filePath);
      }

      const ExcelJS = require('exceljs');
      const wb = new ExcelJS.Workbook();

      // Info sheet with metadata
      const infoWs = wb.addWorksheet('Info');
      infoWs.columns = [
        { header: 'Field', key: 'field', width: 25 },
        { header: 'Value', key: 'value', width: 60 },
      ];
      const infoHeader = infoWs.getRow(1);
      infoHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      infoHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
      infoWs.addRow({ field: 'Document Name', value: doc.original_name });
      infoWs.addRow({ field: 'Stage', value: doc.stage_number ? `Stage ${doc.stage_number}` : 'General' });
      infoWs.addRow({ field: 'File Type', value: ext.toUpperCase() });
      infoWs.addRow({ field: 'Upload Date', value: doc.created_at ? new Date(doc.created_at).toLocaleDateString('en-IN') : '' });

      // Content sheet with PDF text extraction
      if (ext === 'pdf' && fileExists) {
        try {
          const { PDFParse } = require('pdf-parse');
          const pdfBuffer = fs.readFileSync(filePath);
          const pdfData = await new PDFParse({ data: pdfBuffer }).getText();
          const lines = pdfData.text.split('\n').map(l => l.trim()).filter(Boolean);
          if (lines.length) {
            const contentWs = wb.addWorksheet('Content');
            contentWs.columns = [
              { header: 'Line', key: 'line', width: 8 },
              { header: 'Text', key: 'text', width: 120 },
            ];
            const ch = contentWs.getRow(1);
            ch.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            ch.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
            lines.forEach((line, i) => contentWs.addRow({ line: i + 1, text: line }));
          }
        } catch (e) { console.error('PDF extract error:', e.message); }
      }

      const xlsxBuffer = await wb.xlsx.writeBuffer();
      res.setHeader('Content-Disposition', `attachment; filename="${baseName}.xlsx"`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return res.send(Buffer.from(xlsxBuffer));
    }

    // ── Word → HTML-as-doc (Word opens HTML natively, no packages needed) ───
    if (format === 'docx') {
      if ((ext === 'docx' || ext === 'doc') && fileExists) {
        res.setHeader('Content-Disposition', `attachment; filename="${baseName}.${ext}"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        return res.sendFile(filePath);
      }

      const esc = (s) => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

      // Extract PDF content if available
      let contentHtml = '<p style="margin-top:20px;color:#888;font-style:italic;">Download the original file for full content.</p>';
      if (ext === 'pdf' && fileExists) {
        try {
          const { PDFParse } = require('pdf-parse');
          const pdfBuffer = fs.readFileSync(filePath);
          const pdfData = await new PDFParse({ data: pdfBuffer }).getText();
          const text = pdfData.text.trim();
          if (text) {
            contentHtml = `<h2 style="color:#1e3a5f;margin-top:30px;">Document Content</h2>
              <div style="white-space:pre-wrap;font-size:11pt;line-height:1.6;">${esc(text)}</div>`;
          }
        } catch (e) { console.error('PDF extract error:', e.message); }
      }

      const html = `<html><head><meta charset="utf-8">
        <style>body{font-family:Arial,sans-serif;font-size:12pt;margin:2cm;}
        h1{color:#1e3a5f;}table{border-collapse:collapse;width:100%;}
        td{padding:6px 10px;border:1px solid #ccc;}td:first-child{font-weight:bold;width:40%;background:#f0f4fa;}</style>
      </head><body>
        <h1>${esc(baseName)}</h1>
        <table>
          <tr><td>Document Name</td><td>${esc(doc.original_name)}</td></tr>
          <tr><td>Stage</td><td>${esc(doc.stage_number ? 'Stage ' + doc.stage_number : 'General')}</td></tr>
          <tr><td>File Type</td><td>${esc(ext.toUpperCase())}</td></tr>
          <tr><td>Upload Date</td><td>${esc(doc.created_at ? new Date(doc.created_at).toLocaleDateString('en-IN') : '')}</td></tr>
        </table>
        ${contentHtml}
      </body></html>`;

      res.setHeader('Content-Disposition', `attachment; filename="${baseName}.doc"`);
      res.setHeader('Content-Type', 'application/msword');
      return res.send(html);
    }
  } catch (err) {
    console.error('Convert error:', err);
    res.status(500).json({ error: 'Conversion failed: ' + err.message });
  }
});

// Preview endpoint — extracts text from .doc files
router.get('/preview/:id', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM documents WHERE id = ?', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Document not found' });

    const doc = result.rows[0];
    const filePath = path.isAbsolute(doc.storage_path)
      ? doc.storage_path
      : path.join(__dirname, '../../', doc.storage_path);

    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

    const ext = doc.original_name.split('.').pop().toLowerCase();

    if (ext === 'msg') {
      try {
        const MsgReader = require('@kenjiuno/msgreader').default || require('@kenjiuno/msgreader');
        const buffer = fs.readFileSync(filePath);
        const reader = new MsgReader(buffer);
        const info = reader.getFileData();
        return res.json({
          type: 'msg',
          subject: info.subject || '(No subject)',
          senderName: info.senderName || '',
          senderEmail: info.senderEmail || '',
          recipients: (info.recipients || []).map(r => r.name || r.email || '').join(', '),
          date: info.messageDeliveryTime || null,
          body: info.body || '',
          attachments: (info.attachments || []).map(a => ({ name: a.fileName, size: a.dataSize })),
        });
      } catch (e) {
        return res.status(500).json({ error: 'Cannot read this .msg file: ' + e.message });
      }
    }

    if (ext === 'doc') {
      // Read file bytes to detect actual format
      const rawBuf = fs.readFileSync(filePath);
      const hex8 = rawBuf.slice(0, 8).toString('hex');

      if (hex8.startsWith('d0cf11e0')) {
        // Real OLE binary .doc — use word-extractor
        try {
          const WordExtractor = require('word-extractor');
          const extractor = new WordExtractor();
          const extracted = await extractor.extract(filePath);
          const text = extracted.getBody();
          const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.8;white-space:pre-wrap;padding:20px;">${text.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>`;
          return res.json({ html });
        } catch (e) {
          return res.json({ html: null, error: 'Cannot extract text from this .doc file' });
        }
      }

      // Try reading as text/HTML (Word sometimes saves HTML as .doc)
      const rawText = rawBuf.toString('utf8').replace(/^\uFEFF/, ''); // strip BOM
      const lower = rawText.trimStart().toLowerCase();

      if (lower.startsWith('<!doctype') || lower.startsWith('<html')) {
        // Strip Word's mso clutter — keep body content
        const bodyMatch = rawText.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        const bodyContent = bodyMatch ? bodyMatch[1] : rawText;
        const cleaned = bodyContent
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<!--[\s\S]*?-->/g, '');
        const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.8;padding:20px;">${cleaned}</div>`;
        return res.json({ html });
      }

      // Plain text fallback
      const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.8;white-space:pre-wrap;padding:20px;">${rawText.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>`;
      return res.json({ html });
    } else {
      res.status(400).json({ error: 'Use direct URL for this file type' });
    }
  } catch (err) {
    console.error('Preview error:', err);
    res.status(500).json({ error: 'Preview failed' });
  }
});

// Dynamic routes after specific ones
router.get('/:projectId', getDocuments);
router.post('/:projectId', upload.array('files', 10), uploadDocuments);
router.delete('/:id', deleteDocument);

module.exports = router;
