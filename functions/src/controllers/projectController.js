const { db, docToObj, snapshotToArr, now, nowISO, getNextProjectNumber, getUserNamesMap, logAudit } = require('../config/firebase');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const STAGE_DEFINITIONS = [
  { number: 1,  name: 'Customer Requirement',                    requires_document: false, is_mandatory_doc: false },
  { number: 2,  name: 'Customer Name & Company',                 requires_document: false, is_mandatory_doc: false },
  { number: 3,  name: 'Communication',                           requires_document: false, is_mandatory_doc: false },
  { number: 4,  name: 'Customer Type',                           requires_document: false, is_mandatory_doc: false },
  { number: 5,  name: 'Company Details + Vendor Registration',   requires_document: true,  is_mandatory_doc: false },
  { number: 6,  name: 'NDA',                                     requires_document: true,  is_mandatory_doc: false },
  { number: 7,  name: 'Customer Design Requirement',             requires_document: true,  is_mandatory_doc: false },
  { number: 8,  name: 'SST Design + Quotation',                  requires_document: true,  is_mandatory_doc: false },
  { number: 9,  name: 'Negotiation',                             requires_document: true,  is_mandatory_doc: false },
  { number: 10, name: 'Purchase Order (Customer to SST)',        requires_document: true,  is_mandatory_doc: false },
  { number: 11, name: 'PO Acknowledgement (SST to Customer)',    requires_document: true,  is_mandatory_doc: false },
  { number: 12, name: 'Terms & Advance (Performa Invoice)',      requires_document: true,  is_mandatory_doc: false },
  { number: 13, name: 'Payment Received',                        requires_document: true,  is_mandatory_doc: false },
  { number: 14, name: 'Project Execution',                       requires_document: false, is_mandatory_doc: false },
  { number: 15, name: 'Delivery + Invoice',                      requires_document: true,  is_mandatory_doc: false },
  { number: 16, name: 'Installation & Commissioning',            requires_document: true,  is_mandatory_doc: false },
  { number: 17, name: 'Project Sign Up',                         requires_document: true,  is_mandatory_doc: true  },
  { number: 18, name: 'Balance Payment',                         requires_document: true,  is_mandatory_doc: false },
  { number: 19, name: 'Project Closed',                          requires_document: false, is_mandatory_doc: false },
];

const enrichProjects = async (projects) => {
  if (!projects.length) return projects;
  const userIds = [...new Set([
    ...projects.map(p => p.created_by),
    ...projects.map(p => p.assigned_manager)
  ].filter(Boolean))];
  const userMap = await getUserNamesMap(userIds);

  const projectIds = projects.map(p => p.id);
  const [docsSnap, paymentsSnap] = await Promise.all([
    db.collection('documents').where('project_id', 'in', projectIds.slice(0, 10)).get(),
    db.collection('payments').where('project_id', 'in', projectIds.slice(0, 10)).where('status', '==', 'received').get()
  ]);

  const docCount = {};
  snapshotToArr(docsSnap).forEach(d => { docCount[d.project_id] = (docCount[d.project_id] || 0) + 1; });

  const totalReceived = {};
  snapshotToArr(paymentsSnap).forEach(p => { totalReceived[p.project_id] = (totalReceived[p.project_id] || 0) + (p.amount || 0); });

  return projects.map(p => ({
    ...p,
    created_by_name: userMap[p.created_by] || null,
    manager_name: userMap[p.assigned_manager] || null,
    doc_count: docCount[p.id] || 0,
    total_received: totalReceived[p.id] || 0
  }));
};

const getAllProjects = async (req, res) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    let snap = await db.collection('projects').orderBy('created_at', 'desc').get();
    let projects = snapshotToArr(snap);

    if (status) projects = projects.filter(p => p.status === status);
    if (search) {
      const s = search.toLowerCase();
      projects = projects.filter(p =>
        (p.customer_name || '').toLowerCase().includes(s) ||
        (p.company_name || '').toLowerCase().includes(s) ||
        (p.project_number || '').toLowerCase().includes(s)
      );
    }

    const total = projects.length;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const paginated = projects.slice(offset, offset + parseInt(limit));
    const enriched = await enrichProjects(paginated);

    res.json({ projects: enriched, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    console.error('Get projects error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getProjectById = async (req, res) => {
  try {
    const { id } = req.params;
    const projectDoc = await db.collection('projects').doc(id).get();
    if (!projectDoc.exists) return res.status(404).json({ error: 'Project not found' });
    const project = docToObj(projectDoc);

    const [stagesSnap, paymentsSnap, docsSnap] = await Promise.all([
      db.collection('project_stages').where('project_id', '==', id).orderBy('stage_number').get(),
      db.collection('payments').where('project_id', '==', id).orderBy('created_at', 'desc').get(),
      db.collection('documents').where('project_id', '==', id).orderBy('created_at', 'desc').get()
    ]);

    const stages = snapshotToArr(stagesSnap);
    const payments = snapshotToArr(paymentsSnap);
    const documents = snapshotToArr(docsSnap);

    const allUserIds = [...new Set([
      project.created_by, project.assigned_manager,
      ...stages.map(s => s.assigned_to),
      ...payments.map(p => p.created_by),
      ...documents.map(d => d.uploaded_by)
    ].filter(Boolean))];
    const userMap = await getUserNamesMap(allUserIds);

    project.created_by_name = userMap[project.created_by] || null;
    project.manager_name = userMap[project.assigned_manager] || null;
    stages.forEach(s => { s.assigned_to_name = userMap[s.assigned_to] || null; });
    payments.forEach(p => { p.created_by_name = userMap[p.created_by] || null; });
    documents.forEach(d => { d.uploaded_by_name = userMap[d.uploaded_by] || null; });

    res.json({ project, stages, payments, documents });
  } catch (err) {
    console.error('Get project error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const createProject = async (req, res) => {
  try {
    const { project_name, customer_name, company_name, communication_type, customer_type,
            reference, description, priority, assigned_manager, total_value, expected_end_date } = req.body;

    if (!customer_name || !company_name)
      return res.status(400).json({ error: 'Customer name and company name are required' });

    const project_number = await getNextProjectNumber();
    const batch = db.batch();

    const projectRef = db.collection('projects').doc();
    batch.set(projectRef, {
      project_number, project_name: project_name || null, customer_name, company_name,
      communication_type: communication_type || 'Mail', customer_type: customer_type || 'New',
      reference: reference || null, description: description || null,
      priority: priority || 'medium', created_by: req.user.id,
      assigned_manager: assigned_manager || null,
      total_value: total_value || null, expected_end_date: expected_end_date || null,
      current_stage: 1, status: 'active', progress_percentage: 0,
      start_date: new Date().toISOString().split('T')[0],
      actual_end_date: null, created_at: now(), updated_at: now()
    });

    for (const stage of STAGE_DEFINITIONS) {
      const stageRef = db.collection('project_stages').doc();
      batch.set(stageRef, {
        project_id: projectRef.id, stage_number: stage.number, stage_name: stage.name,
        status: stage.number === 1 ? 'in_progress' : 'pending',
        assigned_to: null, assigned_to_name: null, start_time: null, end_time: null,
        comments: null, delay_reason: null,
        requires_document: stage.requires_document, is_mandatory_doc: stage.is_mandatory_doc,
        created_at: now(), updated_at: now()
      });
    }

    await batch.commit();
    await logAudit(req.user.id, 'PROJECT_CREATED', 'project', projectRef.id, { project_number, customer_name }, req.ip);

    const projectDoc = await projectRef.get();
    res.status(201).json(docToObj(projectDoc));
  } catch (err) {
    console.error('Create project error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const updateProject = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await db.collection('projects').doc(id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Project not found' });

    const updates = { updated_at: now() };
    ['project_name','customer_name','company_name','communication_type','customer_type',
     'reference','description','priority','assigned_manager','total_value','expected_end_date','status']
      .forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

    await db.collection('projects').doc(id).update(updates);
    const updated = await db.collection('projects').doc(id).get();
    res.json(docToObj(updated));
  } catch (err) {
    console.error('Update project error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const deleteProject = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await db.collection('projects').doc(id).get();
    if (!doc.exists) return res.status(404).json({ error: 'Project not found' });

    // Delete related data
    const [stagesSnap, docsSnap, paymentsSnap, notifsSnap] = await Promise.all([
      db.collection('project_stages').where('project_id', '==', id).get(),
      db.collection('documents').where('project_id', '==', id).get(),
      db.collection('payments').where('project_id', '==', id).get(),
      db.collection('notifications').where('project_id', '==', id).get()
    ]);

    const batch = db.batch();
    [stagesSnap, docsSnap, paymentsSnap, notifsSnap].forEach(snap => {
      snap.docs.forEach(d => batch.delete(d.ref));
    });
    batch.delete(db.collection('projects').doc(id));
    await batch.commit();

    res.json({ message: 'Project deleted successfully' });
  } catch (err) {
    console.error('Delete project error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const exportProjectExcel = async (req, res) => {
  try {
    const { id } = req.params;
    const projectDoc = await db.collection('projects').doc(id).get();
    if (!projectDoc.exists) return res.status(404).json({ error: 'Project not found' });

    const project = docToObj(projectDoc);
    const [stagesSnap, paymentsSnap, docsSnap] = await Promise.all([
      db.collection('project_stages').where('project_id', '==', id).orderBy('stage_number').get(),
      db.collection('payments').where('project_id', '==', id).orderBy('created_at', 'desc').get(),
      db.collection('documents').where('project_id', '==', id).orderBy('created_at', 'desc').get()
    ]);

    const userMap = await getUserNamesMap([project.created_by, project.assigned_manager].filter(Boolean));
    project.created_by_name = userMap[project.created_by];
    project.manager_name = userMap[project.assigned_manager];

    const wb = new ExcelJS.Workbook();
    const info = wb.addWorksheet('Project Info');
    info.columns = [{ width: 28 }, { width: 40 }];
    const addRow = (label, value) => {
      const row = info.addRow([label, value ?? '-']);
      row.getCell(1).font = { bold: true };
      row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FE' } };
    };
    info.addRow(['SST Application Management System']).getCell(1).font = { bold: true, size: 14 };
    info.addRow(['Project Report']); info.addRow([]);
    addRow('Project Number', project.project_number);
    addRow('Customer', project.customer_name);
    addRow('Company', project.company_name);
    addRow('Status', project.status);
    addRow('Progress', `${project.progress_percentage}%`);
    addRow('Manager', project.manager_name || '-');

    const stSheet = wb.addWorksheet('Stages');
    stSheet.columns = [
      { header: '#', key: 'stage_number', width: 6 },
      { header: 'Stage Name', key: 'stage_name', width: 35 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Comments', key: 'comments', width: 35 }
    ];
    stSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    stSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
    snapshotToArr(stagesSnap).forEach(s => stSheet.addRow(s));

    const paySheet = wb.addWorksheet('Payments');
    paySheet.columns = [
      { header: 'Type', key: 'payment_type', width: 14 },
      { header: 'Amount', key: 'amount', width: 16 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Notes', key: 'notes', width: 30 }
    ];
    paySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    paySheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
    snapshotToArr(paymentsSnap).forEach(p => paySheet.addRow(p));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${project.project_number}_report.xlsx`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Excel export error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const exportProjectPDF = async (req, res) => {
  try {
    const { id } = req.params;
    const projectDoc = await db.collection('projects').doc(id).get();
    if (!projectDoc.exists) return res.status(404).json({ error: 'Project not found' });
    const project = docToObj(projectDoc);

    const [stagesSnap, paymentsSnap] = await Promise.all([
      db.collection('project_stages').where('project_id', '==', id).orderBy('stage_number').get(),
      db.collection('payments').where('project_id', '==', id).orderBy('created_at', 'desc').get()
    ]);

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${project.project_number}_report.pdf`);
    doc.pipe(res);

    doc.rect(0, 0, 595, 70).fill('#1E40AF');
    doc.fillColor('white').fontSize(18).font('Helvetica-Bold').text('SST Application Management System', 40, 18);
    doc.fontSize(10).font('Helvetica').text(`Project Report  ·  Generated: ${new Date().toLocaleDateString('en-IN')}`, 40, 44);
    doc.fillColor('black').moveDown(3);

    doc.fontSize(13).font('Helvetica-Bold').fillColor('#1E40AF').text('Project Overview');
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#1E40AF').stroke();
    doc.moveDown(0.4);

    const field = (label, val) => {
      doc.fontSize(9).font('Helvetica-Bold').fillColor('#374151').text(`${label}: `, { continued: true });
      doc.font('Helvetica').fillColor('#111827').text(String(val || '-'));
    };
    field('Project Number', project.project_number);
    field('Customer', project.customer_name);
    field('Company', project.company_name);
    field('Status', project.status?.toUpperCase());
    field('Progress', `${project.progress_percentage}% (Stage ${project.current_stage}/19)`);
    if (project.description) field('Description', project.description);

    doc.moveDown(1);
    doc.fontSize(13).font('Helvetica-Bold').fillColor('#1E40AF').text('Stage Progress');
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#1E40AF').stroke();
    doc.moveDown(0.4);

    const stCols = [30, 250, 80, 100];
    const stHeaders = ['#', 'Stage Name', 'Status', 'Assigned To'];
    let x = 40;
    const hy = doc.y;
    doc.rect(40, hy - 3, 515, 18).fill('#1E40AF');
    stHeaders.forEach((h, i) => { doc.fillColor('white').fontSize(8).font('Helvetica-Bold').text(h, x + 3, hy, { width: stCols[i] }); x += stCols[i]; });
    doc.fillColor('black').font('Helvetica').fontSize(8);
    snapshotToArr(stagesSnap).forEach((s, idx) => {
      if (doc.y > 750) doc.addPage();
      const y = doc.y + 3;
      if (idx % 2 === 0) doc.rect(40, y - 2, 515, 15).fill('#F8FAFC');
      doc.fillColor(s.status === 'completed' ? '#16a34a' : s.status === 'delayed' ? '#dc2626' : '#374151');
      x = 40;
      [s.stage_number, s.stage_name, s.status, s.assigned_to_name || '-'].forEach((val, i) => {
        doc.text(String(val || ''), x + 3, y, { width: stCols[i] }); x += stCols[i];
      });
      doc.fillColor('black').moveDown(0.2);
    });

    doc.end();
  } catch (err) {
    console.error('PDF export error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getAllProjects, getProjectById, createProject, updateProject, deleteProject, exportProjectExcel, exportProjectPDF };
