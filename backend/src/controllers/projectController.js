const db = require('../config/database');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const STAGE_DEFINITIONS = [
  { number: 1,  name: 'Customer Requirement',                    requires_document: 0, is_mandatory_doc: 0 },
  { number: 2,  name: 'Customer Name & Company',                 requires_document: 0, is_mandatory_doc: 0 },
  { number: 3,  name: 'Communication',                           requires_document: 0, is_mandatory_doc: 0 },
  { number: 4,  name: 'Customer Type',                           requires_document: 0, is_mandatory_doc: 0 },
  { number: 5,  name: 'Company Details + Vendor Registration',   requires_document: 1, is_mandatory_doc: 0 },
  { number: 6,  name: 'NDA',                                     requires_document: 1, is_mandatory_doc: 0 },
  { number: 7,  name: 'Customer Design Requirement',             requires_document: 1, is_mandatory_doc: 0 },
  { number: 8,  name: 'SST Design + Quotation',                  requires_document: 1, is_mandatory_doc: 0 },
  { number: 9,  name: 'Negotiation',                             requires_document: 1, is_mandatory_doc: 0 },
  { number: 10, name: 'Purchase Order (Customer to SST)',        requires_document: 1, is_mandatory_doc: 0 },
  { number: 11, name: 'PO Acknowledgement (SST to Customer)',    requires_document: 1, is_mandatory_doc: 0 },
  { number: 12, name: 'Terms & Advance (Performa Invoice)',      requires_document: 1, is_mandatory_doc: 0 },
  { number: 13, name: 'Payment Received',                        requires_document: 1, is_mandatory_doc: 0 },
  { number: 14, name: 'Project Execution',                       requires_document: 0, is_mandatory_doc: 0 },
  { number: 15, name: 'Delivery + Invoice',                      requires_document: 1, is_mandatory_doc: 0 },
  { number: 16, name: 'Installation & Commissioning',            requires_document: 1, is_mandatory_doc: 0 },
  { number: 17, name: 'Project Sign Up',                         requires_document: 1, is_mandatory_doc: 1 },
  { number: 18, name: 'Balance Payment',                         requires_document: 1, is_mandatory_doc: 0 },
  { number: 19, name: 'Project Closed',                          requires_document: 0, is_mandatory_doc: 0 },
];

const generateProjectNumber = async () => {
  const year = new Date().getFullYear();
  const result = await db.query(
    "SELECT COUNT(*) as count FROM projects WHERE strftime('%Y', created_at) = ?",
    [String(year)]
  );
  const count = parseInt(result.rows[0].count) + 1;
  return `SST-${year}-${String(count).padStart(4, '0')}`;
};

const getAllProjects = async (req, res) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = [];
    const params = [];

    if (status) { conditions.push(`p.status = ?`); params.push(status); }
    if (search) {
      conditions.push(`(p.customer_name LIKE ? OR p.company_name LIKE ? OR p.project_number LIKE ?)`);
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await db.query(
      `SELECT COUNT(DISTINCT p.id) as count FROM projects p ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    const projectsResult = await db.query(
      `SELECT DISTINCT p.*,
        u.full_name as created_by_name,
        m.full_name as manager_name,
        (SELECT COUNT(*) FROM documents WHERE project_id = p.id) as doc_count,
        (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE project_id = p.id AND status = 'received') as total_received
       FROM projects p
       LEFT JOIN users u ON p.created_by = u.id
       LEFT JOIN users m ON p.assigned_manager = m.id
       ${whereClause}
       ORDER BY p.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    res.json({
      projects: projectsResult.rows,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit))
    });
  } catch (err) {
    console.error('Get projects error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getProjectById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `SELECT p.*, u.full_name as created_by_name, m.full_name as manager_name
       FROM projects p
       LEFT JOIN users u ON p.created_by = u.id
       LEFT JOIN users m ON p.assigned_manager = m.id
       WHERE p.id = ?`,
      [id]
    );

    if (!result.rows[0]) return res.status(404).json({ error: 'Project not found' });

    const [stages, payments, documents] = await Promise.all([
      db.query(
        `SELECT ps.*, u.full_name as assigned_to_name
         FROM project_stages ps
         LEFT JOIN users u ON ps.assigned_to = u.id
         WHERE ps.project_id = ? ORDER BY ps.stage_number`,
        [id]
      ),
      db.query(
        `SELECT p.*, u.full_name as created_by_name, d.original_name as proof_doc_name
         FROM payments p
         LEFT JOIN users u ON p.created_by = u.id
         LEFT JOIN documents d ON p.payment_proof_doc_id = d.id
         WHERE p.project_id = ? ORDER BY p.created_at DESC`,
        [id]
      ),
      db.query(
        `SELECT d.*, u.full_name as uploaded_by_name
         FROM documents d
         LEFT JOIN users u ON d.uploaded_by = u.id
         WHERE d.project_id = ? ORDER BY d.created_at DESC`,
        [id]
      )
    ]);

    res.json({
      project: result.rows[0],
      stages: stages.rows,
      payments: payments.rows,
      documents: documents.rows
    });
  } catch (err) {
    console.error('Get project error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const createProject = async (req, res) => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const {
      project_name, customer_name, company_name, communication_type,
      customer_type, reference, description, priority,
      assigned_manager, total_value, expected_end_date
    } = req.body;

    if (!customer_name || !company_name) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Customer name and company name are required' });
    }

    const project_number = await generateProjectNumber();

    const project = await client.query(
      `INSERT INTO projects
        (project_number, project_name, customer_name, company_name, communication_type, customer_type,
         reference, description, priority, created_by, assigned_manager, total_value, expected_end_date)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING *`,
      [project_number, project_name || null, customer_name, company_name, communication_type || 'Mail',
       customer_type || 'New', reference || null, description || null,
       priority || 'medium', req.user.id, assigned_manager || null,
       total_value || null, expected_end_date || null]
    );

    const projectId = project.rows[0].id;

    for (const stage of STAGE_DEFINITIONS) {
      await client.query(
        `INSERT INTO project_stages (project_id, stage_number, stage_name, status, requires_document, is_mandatory_doc)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [projectId, stage.number, stage.name,
         stage.number === 1 ? 'in_progress' : 'pending',
         stage.requires_document, stage.is_mandatory_doc]
      );
    }

    await client.query(
      "INSERT INTO audit_logs (user_id, action, entity_type, entity_id, new_values, ip_address) VALUES (?, 'PROJECT_CREATED', 'project', ?, ?, ?)",
      [req.user.id, projectId, JSON.stringify({ project_number, customer_name }), req.ip]
    );

    await client.query('COMMIT');
    res.status(201).json(project.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create project error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
};

const updateProject = async (req, res) => {
  try {
    const { id } = req.params;
    const fields = ['project_name','customer_name','company_name','communication_type','customer_type',
                    'reference','description','priority','assigned_manager','total_value',
                    'expected_end_date','status'];
    const setClauses = [];
    const params = [];
    fields.forEach(f => {
      if (req.body[f] !== undefined) {
        setClauses.push(`${f} = ?`);
        params.push(req.body[f]);
      }
    });
    if (!setClauses.length) return res.status(400).json({ error: 'No fields to update' });
    setClauses.push(`updated_at = datetime('now')`);
    params.push(id);

    await db.query(`UPDATE projects SET ${setClauses.join(', ')} WHERE id = ?`, params);
    const result = await db.query('SELECT * FROM projects WHERE id = ?', [id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Project not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update project error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const deleteProject = async (req, res) => {
  try {
    const result = await db.query('SELECT id FROM projects WHERE id = ?', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Project not found' });
    await db.query('DELETE FROM projects WHERE id = ?', [req.params.id]);
    res.json({ message: 'Project deleted successfully' });
  } catch (err) {
    console.error('Delete project error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const exportProjectExcel = async (req, res) => {
  try {
    const { id } = req.params;
    const [projRes, stagesRes, paymentsRes, docsRes] = await Promise.all([
      db.query(`SELECT p.*, u.full_name as created_by_name, m.full_name as manager_name FROM projects p LEFT JOIN users u ON p.created_by=u.id LEFT JOIN users m ON p.assigned_manager=m.id WHERE p.id=?`, [id]),
      db.query(`SELECT ps.*, u.full_name as assigned_to_name FROM project_stages ps LEFT JOIN users u ON ps.assigned_to=u.id WHERE ps.project_id=? ORDER BY ps.stage_number`, [id]),
      db.query(`SELECT * FROM payments WHERE project_id=? ORDER BY created_at DESC`, [id]),
      db.query(`SELECT d.*, u.full_name as uploaded_by_name FROM documents d LEFT JOIN users u ON d.uploaded_by=u.id WHERE d.project_id=? ORDER BY d.created_at DESC`, [id]),
    ]);
    if (!projRes.rows[0]) return res.status(404).json({ error: 'Project not found' });
    const project = projRes.rows[0];

    const wb = new ExcelJS.Workbook();
    wb.creator = 'SST AMS';

    // Sheet 1 – Project Info
    const info = wb.addWorksheet('Project Info');
    info.columns = [{ width: 28 }, { width: 40 }];
    const addRow = (label, value) => {
      const row = info.addRow([label, value ?? '-']);
      row.getCell(1).font = { bold: true };
      row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FE' } };
    };
    info.addRow(['SST Application Management System']).getCell(1).font = { bold: true, size: 14 };
    info.addRow(['Project Report']);
    info.addRow([]);
    addRow('Project Number', project.project_number);
    addRow('Project Name', project.project_name);
    addRow('Customer', project.customer_name);
    addRow('Company', project.company_name);
    addRow('Status', project.status);
    addRow('Priority', project.priority);
    addRow('Current Stage', `${project.current_stage}/19`);
    addRow('Progress', `${project.progress_percentage}%`);
    addRow('Total Value', project.total_value ? `₹${Number(project.total_value).toLocaleString('en-IN')}` : '-');
    addRow('Manager', project.manager_name || '-');
    addRow('Created By', project.created_by_name);
    addRow('Start Date', project.start_date || '-');
    addRow('Expected End Date', project.expected_end_date || '-');
    addRow('Description', project.description || '-');

    // Sheet 2 – Stages
    const stSheet = wb.addWorksheet('Stages');
    stSheet.columns = [
      { header: '#', key: 'stage_number', width: 6 },
      { header: 'Stage Name', key: 'stage_name', width: 35 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Assigned To', key: 'assigned_to_name', width: 20 },
      { header: 'Comments', key: 'comments', width: 35 },
    ];
    stSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    stSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
    stagesRes.rows.forEach(s => stSheet.addRow(s));

    // Sheet 3 – Payments
    const paySheet = wb.addWorksheet('Payments');
    paySheet.columns = [
      { header: 'Type', key: 'payment_type', width: 14 },
      { header: 'Amount', key: 'amount', width: 16 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Due Date', key: 'due_date', width: 14 },
      { header: 'Received Date', key: 'received_date', width: 16 },
      { header: 'Notes', key: 'notes', width: 30 },
    ];
    paySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    paySheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
    paymentsRes.rows.forEach(p => paySheet.addRow(p));

    // Sheet 4 – Documents
    const docSheet = wb.addWorksheet('Documents');
    docSheet.columns = [
      { header: 'File Name', key: 'original_name', width: 35 },
      { header: 'Stage', key: 'stage_number', width: 10 },
      { header: 'Uploaded By', key: 'uploaded_by_name', width: 20 },
      { header: 'Uploaded At', key: 'created_at', width: 20 },
    ];
    docSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    docSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
    docsRes.rows.forEach(d => docSheet.addRow(d));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${project.project_number}_report.xlsx`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Project Excel export error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const exportProjectPDF = async (req, res) => {
  try {
    const { id } = req.params;
    const [projRes, stagesRes, paymentsRes] = await Promise.all([
      db.query(`SELECT p.*, u.full_name as created_by_name, m.full_name as manager_name FROM projects p LEFT JOIN users u ON p.created_by=u.id LEFT JOIN users m ON p.assigned_manager=m.id WHERE p.id=?`, [id]),
      db.query(`SELECT * FROM project_stages WHERE project_id=? ORDER BY stage_number`, [id]),
      db.query(`SELECT * FROM payments WHERE project_id=? ORDER BY created_at DESC`, [id]),
    ]);
    if (!projRes.rows[0]) return res.status(404).json({ error: 'Project not found' });
    const project = projRes.rows[0];

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${project.project_number}_report.pdf`);
    doc.pipe(res);

    // Title
    doc.rect(0, 0, 595, 70).fill('#1E40AF');
    doc.fillColor('white').fontSize(18).font('Helvetica-Bold')
      .text('SST Application Management System', 40, 18);
    doc.fontSize(10).font('Helvetica')
      .text(`Project Report  ·  Generated: ${new Date().toLocaleDateString('en-IN')}`, 40, 44);
    doc.fillColor('black').moveDown(3);

    // Project Info
    doc.fontSize(13).font('Helvetica-Bold').fillColor('#1E40AF').text('Project Overview');
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#1E40AF').stroke();
    doc.moveDown(0.4);

    const field = (label, val) => {
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#374151').text(`${label}: `, { continued: true });
      doc.font('Helvetica').fillColor('#111827').text(String(val || '-'));
    };
    field('Project Number', project.project_number);
    field('Project Name', project.project_name);
    field('Customer', project.customer_name);
    field('Company', project.company_name);
    field('Status', project.status?.toUpperCase());
    field('Priority', project.priority?.toUpperCase());
    field('Progress', `${project.progress_percentage}% (Stage ${project.current_stage}/19)`);
    field('Total Value', project.total_value ? `Rs. ${Number(project.total_value).toLocaleString('en-IN')}` : '-');
    field('Manager', project.manager_name || '-');
    field('Expected End Date', project.expected_end_date || '-');
    if (project.description) field('Description', project.description);

    doc.moveDown(1);

    // Stages table
    doc.fontSize(13).font('Helvetica-Bold').fillColor('#1E40AF').text('Stage Progress');
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#1E40AF').stroke();
    doc.moveDown(0.4);

    const stCols = [30, 250, 80, 100];
    const stHeaders = ['#', 'Stage Name', 'Status', 'Assigned To'];
    let x = 40;
    const hy = doc.y;
    doc.rect(40, hy - 3, 515, 18).fill('#1E40AF');
    stHeaders.forEach((h, i) => {
      doc.fillColor('white').fontSize(8).font('Helvetica-Bold').text(h, x + 3, hy, { width: stCols[i] });
      x += stCols[i];
    });
    doc.fillColor('black').font('Helvetica').fontSize(8);
    stagesRes.rows.forEach((s, idx) => {
      if (doc.y > 750) { doc.addPage(); }
      const y = doc.y + 3;
      if (idx % 2 === 0) doc.rect(40, y - 2, 515, 15).fill('#F8FAFC');
      doc.fillColor(s.status === 'completed' ? '#16a34a' : s.status === 'delayed' ? '#dc2626' : '#374151');
      x = 40;
      [s.stage_number, s.stage_name, s.status, s.assigned_to_name || '-'].forEach((val, i) => {
        doc.text(String(val || ''), x + 3, y, { width: stCols[i] });
        x += stCols[i];
      });
      doc.fillColor('black').moveDown(0.2);
    });

    // Payments
    if (paymentsRes.rows.length > 0) {
      doc.moveDown(1);
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#1E40AF').text('Payments');
      doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#1E40AF').stroke();
      doc.moveDown(0.4);

      const pCols = [90, 100, 80, 90, 100];
      const pHeaders = ['Type', 'Amount', 'Status', 'Due Date', 'Received Date'];
      x = 40;
      const py = doc.y;
      doc.rect(40, py - 3, 515, 18).fill('#1E40AF');
      pHeaders.forEach((h, i) => {
        doc.fillColor('white').fontSize(8).font('Helvetica-Bold').text(h, x + 3, py, { width: pCols[i] });
        x += pCols[i];
      });
      doc.fillColor('black').font('Helvetica').fontSize(8);
      paymentsRes.rows.forEach((p, idx) => {
        const y = doc.y + 3;
        if (idx % 2 === 0) doc.rect(40, y - 2, 515, 15).fill('#F8FAFC');
        doc.fillColor('#111827');
        x = 40;
        [p.payment_type, `Rs. ${Number(p.amount).toLocaleString('en-IN')}`,
         p.status, p.due_date || '-', p.received_date || '-'].forEach((val, i) => {
          doc.text(String(val || ''), x + 3, y, { width: pCols[i] });
          x += pCols[i];
        });
        doc.moveDown(0.2);
      });
    }

    doc.end();
  } catch (err) {
    console.error('Project PDF export error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getAllProjects, getProjectById, createProject, updateProject, deleteProject, exportProjectExcel, exportProjectPDF };
