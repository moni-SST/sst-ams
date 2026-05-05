const { db, snapshotToArr, getUserNamesMap } = require('../config/firebase');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const getDashboardStats = async (req, res) => {
  try {
    const [projectsSnap, paymentsSnap, stagesSnap] = await Promise.all([
      db.collection('projects').get(),
      db.collection('payments').get(),
      db.collection('project_stages').get()
    ]);

    const projects = snapshotToArr(projectsSnap);
    const payments = snapshotToArr(paymentsSnap);
    const stages = snapshotToArr(stagesSnap);

    const totalValue = projects.reduce((s, p) => s + (parseFloat(p.total_value) || 0), 0);

    const projectStats = {
      total: projects.length,
      active: projects.filter(p => p.status === 'active').length,
      completed: projects.filter(p => p.status === 'completed').length,
      delayed: projects.filter(p => p.status === 'delayed').length,
      on_hold: projects.filter(p => p.status === 'on_hold').length
    };

    const totalReceived = payments.filter(p => p.status === 'received').reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    const paymentStats = {
      total_received: totalReceived,
      total_pending: totalValue - totalReceived,
      total_overdue: payments.filter(p => p.status === 'overdue').reduce((s, p) => s + (parseFloat(p.amount) || 0), 0),
      pending_count: payments.filter(p => p.status === 'pending').length
    };

    const stageStats = {
      delayed_stages: stages.filter(s => s.status === 'delayed').length,
      active_stages: stages.filter(s => s.status === 'in_progress').length
    };

    res.json({ projects: projectStats, payments: paymentStats, stages: stageStats });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getProjectAnalytics = async (req, res) => {
  try {
    const [projectsSnap, paymentsSnap, stagesSnap] = await Promise.all([
      db.collection('projects').get(),
      db.collection('payments').where('status', '==', 'received').get(),
      db.collection('project_stages').get()
    ]);

    const projects = snapshotToArr(projectsSnap);
    const payments = snapshotToArr(paymentsSnap);
    const stages = snapshotToArr(stagesSnap);

    // Status distribution
    const statusDist = {};
    projects.forEach(p => { statusDist[p.status] = (statusDist[p.status] || 0) + 1; });
    const status_distribution = Object.entries(statusDist).map(([status, count]) => ({ status, count }));

    // Monthly trend (last 12 months)
    const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - 1);
    const monthlyMap = {};
    projects.forEach(p => {
      const d = new Date(p.created_at);
      if (d < cutoff) return;
      const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyMap[month]) monthlyMap[month] = { month, created: 0, completed: 0 };
      monthlyMap[month].created++;
      if (p.status === 'completed') monthlyMap[month].completed++;
    });
    const monthly_trend = Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month));

    // Stage performance
    const stageMap = {};
    stages.forEach(s => {
      if (!stageMap[s.stage_number]) stageMap[s.stage_number] = { stage_number: s.stage_number, stage_name: s.stage_name, total: 0, completed: 0, delayed: 0, totalDays: 0, timedCount: 0 };
      const sm = stageMap[s.stage_number];
      sm.total++;
      if (s.status === 'completed') sm.completed++;
      if (s.status === 'delayed') sm.delayed++;
      if (s.status === 'completed' && s.start_time && s.end_time) {
        sm.totalDays += (new Date(s.end_time) - new Date(s.start_time)) / (1000 * 60 * 60 * 24);
        sm.timedCount++;
      }
    });
    const stage_performance = Object.values(stageMap).map(s => ({
      ...s, avg_days: s.timedCount > 0 ? s.totalDays / s.timedCount : null
    })).sort((a, b) => a.stage_number - b.stage_number);

    // Project list with manager names and total received
    const managerIds = [...new Set(projects.map(p => p.assigned_manager).filter(Boolean))];
    const managerMap = await getUserNamesMap(managerIds);
    const receivedMap = {};
    payments.forEach(p => { receivedMap[p.project_id] = (receivedMap[p.project_id] || 0) + (parseFloat(p.amount) || 0); });

    const project_list = projects.map(p => ({
      ...p, manager_name: managerMap[p.assigned_manager] || null, total_received: receivedMap[p.id] || 0
    })).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json({ status_distribution, monthly_trend, stage_performance, project_list });
  } catch (err) {
    console.error('Project analytics error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getPaymentAnalytics = async (req, res) => {
  try {
    const snap = await db.collection('payments').get();
    const payments = snapshotToArr(snap);

    const summary = { received: 0, pending: 0, overdue: 0 };
    payments.forEach(p => {
      const amt = parseFloat(p.amount) || 0;
      if (p.status === 'received') summary.received += amt;
      if (p.status === 'pending') summary.pending += amt;
      if (p.status === 'overdue') summary.overdue += amt;
    });

    const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - 1);
    const monthlyMap = {};
    payments.forEach(p => {
      const d = new Date(p.created_at);
      if (d < cutoff) return;
      const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyMap[month]) monthlyMap[month] = { month, received: 0, pending: 0 };
      const amt = parseFloat(p.amount) || 0;
      if (p.status === 'received') monthlyMap[month].received += amt;
      if (p.status === 'pending') monthlyMap[month].pending += amt;
    });
    const monthly_trend = Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month));

    const typeMap = {};
    payments.forEach(p => {
      if (!typeMap[p.payment_type]) typeMap[p.payment_type] = { payment_type: p.payment_type, count: 0, total: 0 };
      typeMap[p.payment_type].count++;
      typeMap[p.payment_type].total += parseFloat(p.amount) || 0;
    });
    const by_type = Object.values(typeMap);

    res.json({ summary, monthly_trend, by_type });
  } catch (err) {
    console.error('Payment analytics error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const exportProjectsExcel = async (req, res) => {
  try {
    const projectsSnap = await db.collection('projects').orderBy('created_at', 'desc').get();
    const projects = snapshotToArr(projectsSnap);

    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Projects');
    sheet.columns = [
      { header: 'Project No.', key: 'project_number', width: 18 },
      { header: 'Customer', key: 'customer_name', width: 20 },
      { header: 'Company', key: 'company_name', width: 25 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Stage', key: 'current_stage', width: 10 },
      { header: 'Progress %', key: 'progress_percentage', width: 12 },
      { header: 'Priority', key: 'priority', width: 12 },
      { header: 'Created', key: 'created_at', width: 18 }
    ];
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
    projects.forEach(p => sheet.addRow(p));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=projects_report.xlsx');
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Export Excel error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const exportProjectsPDF = async (req, res) => {
  try {
    const snap = await db.collection('projects').orderBy('created_at', 'desc').get();
    const projects = snapshotToArr(snap);

    const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=projects_report.pdf');
    doc.pipe(res);

    doc.fontSize(18).font('Helvetica-Bold').text('SST Application Management System', { align: 'center' });
    doc.fontSize(12).font('Helvetica').text(`Projects Report - Generated: ${new Date().toLocaleDateString()}`, { align: 'center' });
    doc.moveDown();

    const headers = ['Project No.', 'Customer', 'Company', 'Status', 'Stage', 'Progress'];
    const colWidths = [120, 130, 150, 80, 50, 70];
    let x = 40;
    const headerY = doc.y;
    doc.rect(40, headerY - 4, 600, 20).fill('#1E40AF');
    headers.forEach((h, i) => { doc.fillColor('white').fontSize(9).font('Helvetica-Bold').text(h, x + 3, headerY, { width: colWidths[i] }); x += colWidths[i]; });
    doc.fillColor('black').font('Helvetica').fontSize(8);
    projects.forEach((p, idx) => {
      const y = doc.y + 4;
      if (idx % 2 === 0) doc.rect(40, y - 2, 600, 16).fill('#F8FAFC');
      doc.fillColor('black');
      x = 40;
      [p.project_number, p.customer_name, p.company_name, p.status, `${p.current_stage}/19`, `${p.progress_percentage}%`]
        .forEach((val, i) => { doc.text(String(val || ''), x + 3, y, { width: colWidths[i] }); x += colWidths[i]; });
      doc.moveDown(0.3);
    });
    doc.end();
  } catch (err) {
    console.error('Export PDF error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getDashboardStats, getProjectAnalytics, getPaymentAnalytics, exportProjectsExcel, exportProjectsPDF };
