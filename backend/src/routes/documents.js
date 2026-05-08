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

    // ── Excel ────────────────────────────────────────────────────────────────
    if (format === 'xlsx') {
      // If already Excel and file exists, serve original
      if ((ext === 'xlsx' || ext === 'xls') && fileExists) {
        res.setHeader('Content-Disposition', `attachment; filename="${baseName}.${ext}"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        return res.sendFile(filePath);
      }

      // Build Excel from document metadata (no file access needed)
      const ExcelJS = require('exceljs');
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Document Info');

      ws.columns = [
        { header: 'Field', key: 'field', width: 30 },
        { header: 'Value', key: 'value', width: 60 },
      ];
      ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };

      ws.addRow({ field: 'Document Name', value: doc.original_name });
      ws.addRow({ field: 'Stage', value: doc.stage_number ? `Stage ${doc.stage_number}` : 'General' });
      ws.addRow({ field: 'Uploaded By', value: doc.uploaded_by_name || '' });
      ws.addRow({ field: 'Upload Date', value: doc.created_at ? new Date(doc.created_at).toLocaleDateString('en-IN') : '' });
      ws.addRow({ field: 'File Type', value: ext.toUpperCase() });

      const xlsxBuffer = await wb.xlsx.writeBuffer();
      res.setHeader('Content-Disposition', `attachment; filename="${baseName}.xlsx"`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return res.send(Buffer.from(xlsxBuffer));
    }

    // ── Word ─────────────────────────────────────────────────────────────────
    if (format === 'docx') {
      // If already Word and file exists, serve original
      if ((ext === 'docx' || ext === 'doc') && fileExists) {
        res.setHeader('Content-Disposition', `attachment; filename="${baseName}.${ext}"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        return res.sendFile(filePath);
      }

      // Try docx npm package; fall back to HTML-as-doc if unavailable
      try {
        const { Document, Paragraph, TextRun, HeadingLevel } = require('docx');
        const { Packer } = require('docx');

        const wordDoc = new Document({
          sections: [{
            properties: {},
            children: [
              new Paragraph({ text: baseName, heading: HeadingLevel.HEADING_1 }),
              new Paragraph({ children: [new TextRun('')] }),
              new Paragraph({ children: [new TextRun({ text: `Document: ${doc.original_name}`, size: 24 })] }),
              new Paragraph({ children: [new TextRun({ text: `Stage: ${doc.stage_number ? 'Stage ' + doc.stage_number : 'General'}`, size: 24 })] }),
              new Paragraph({ children: [new TextRun({ text: `File Type: ${ext.toUpperCase()}`, size: 24 })] }),
              new Paragraph({ children: [new TextRun({ text: `Upload Date: ${doc.created_at ? new Date(doc.created_at).toLocaleDateString('en-IN') : ''}`, size: 24 })] }),
              new Paragraph({ children: [new TextRun('')] }),
              new Paragraph({ children: [new TextRun({ text: 'Note: Download the original file for full content.', size: 22, italics: true })] }),
            ],
          }],
        });

        const docxBuffer = await Packer.toBuffer(wordDoc);
        res.setHeader('Content-Disposition', `attachment; filename="${baseName}.docx"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        return res.send(docxBuffer);
      } catch {
        // docx package unavailable — return HTML that Word can open
        const html = `<html><head><meta charset="utf-8"></head><body>
          <h1>${baseName}</h1>
          <p><b>Document:</b> ${doc.original_name}</p>
          <p><b>Stage:</b> ${doc.stage_number ? 'Stage ' + doc.stage_number : 'General'}</p>
          <p><b>File Type:</b> ${ext.toUpperCase()}</p>
          <p><b>Upload Date:</b> ${doc.created_at ? new Date(doc.created_at).toLocaleDateString('en-IN') : ''}</p>
          <p><i>Note: Download the original file for full content.</i></p>
        </body></html>`;
        res.setHeader('Content-Disposition', `attachment; filename="${baseName}.doc"`);
        res.setHeader('Content-Type', 'application/msword');
        return res.send(html);
      }
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
