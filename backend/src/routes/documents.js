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
    const filePath = path.isAbsolute(doc.storage_path)
      ? doc.storage_path
      : path.join(__dirname, '../../', doc.storage_path);

    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

    const ext = doc.original_name.split('.').pop().toLowerCase();
    const baseName = doc.original_name.replace(/\.[^.]+$/, '');

    if (format === 'docx') {
      // If already a Word file, serve as-is
      if (ext === 'docx' || ext === 'doc') {
        res.setHeader('Content-Disposition', `attachment; filename="${baseName}.${ext}"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        return res.sendFile(filePath);
      }

      // Convert to Word using docx package
      const { Document, Paragraph, TextRun, HeadingLevel, AlignmentType } = require('docx');
      let paragraphs = [];

      // Try to extract text from PDF
      if (ext === 'pdf') {
        try {
          const pdfParse = require('pdf-parse');
          const pdfBuffer = fs.readFileSync(filePath);
          const pdfData = await pdfParse(pdfBuffer);
          const lines = pdfData.text.split('\n').filter(l => l.trim());
          paragraphs = lines.map(line =>
            new Paragraph({ children: [new TextRun({ text: line.trim(), size: 24 })] })
          );
        } catch { /* fall through to metadata-only */ }
      }

      if (paragraphs.length === 0) {
        paragraphs = [
          new Paragraph({
            children: [new TextRun({ text: 'This document was converted from: ' + doc.original_name, size: 24 })]
          }),
          new Paragraph({ children: [new TextRun({ text: '', size: 24 })] }),
          new Paragraph({
            children: [new TextRun({ text: 'Please download the original file for full content.', size: 24, italics: true })]
          }),
        ];
      }

      const wordDoc = new Document({
        sections: [{
          properties: {},
          children: [
            new Paragraph({
              text: baseName,
              heading: HeadingLevel.HEADING_1,
            }),
            new Paragraph({ children: [new TextRun({ text: '', size: 24 })] }),
            ...paragraphs,
          ],
        }],
      });

      const { Packer } = require('docx');
      const buffer = await Packer.toBuffer(wordDoc);
      res.setHeader('Content-Disposition', `attachment; filename="${baseName}.docx"`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      return res.send(buffer);
    }

    if (format === 'xlsx') {
      // If already an Excel file, serve as-is
      if (ext === 'xlsx' || ext === 'xls') {
        res.setHeader('Content-Disposition', `attachment; filename="${baseName}.${ext}"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        return res.sendFile(filePath);
      }

      // Create Excel with document metadata + extracted text
      const ExcelJS = require('exceljs');
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Document');

      ws.columns = [
        { header: 'Field', key: 'field', width: 25 },
        { header: 'Value', key: 'value', width: 60 },
      ];

      // Style header row
      ws.getRow(1).font = { bold: true };
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
      ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

      ws.addRow({ field: 'Document Name', value: doc.original_name });
      ws.addRow({ field: 'Stage', value: doc.stage_number ? `Stage ${doc.stage_number}` : 'General' });
      ws.addRow({ field: 'Uploaded By', value: doc.uploaded_by_name || '' });
      ws.addRow({ field: 'Upload Date', value: doc.created_at ? new Date(doc.created_at).toLocaleDateString() : '' });
      ws.addRow({ field: 'File Type', value: ext.toUpperCase() });

      // Extract text content if PDF
      if (ext === 'pdf') {
        try {
          const pdfParse = require('pdf-parse');
          const pdfBuffer = fs.readFileSync(filePath);
          const pdfData = await pdfParse(pdfBuffer);
          ws.addRow({});
          ws.addRow({ field: 'Document Content', value: '' });
          const lines = pdfData.text.split('\n').filter(l => l.trim());
          lines.forEach(line => ws.addRow({ field: '', value: line.trim() }));
        } catch { /* no text extraction */ }
      }

      res.setHeader('Content-Disposition', `attachment; filename="${baseName}.xlsx"`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      await wb.xlsx.write(res);
      return res.end();
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
