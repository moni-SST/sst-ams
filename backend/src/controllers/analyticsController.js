const db = require('../config/database');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

const getDashboardStats = async (req, res) => {
  try {
    const [projects, payments, stages] = await Promise.all([
      db.query(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'delayed' THEN 1 ELSE 0 END) as delayed,
          SUM(CASE WHEN status = 'on_hold' THEN 1 ELSE 0 END) as on_hold
        FROM projects
      `),
      db.query(`
        SELECT
          COALESCE(SUM(CASE WHEN status = 'received' THEN amount ELSE 0 END), 0) as total_received,
          COALESCE(
            (SELECT SUM(total_value) FROM projects WHERE total_value IS NOT NULL) -
            SUM(CASE WHEN status = 'received' THEN amount ELSE 0 END),
            0
          ) as total_pending,
          COALESCE(SUM(CASE WHEN status = 'overdue' THEN amount ELSE 0 END), 0) as total_overdue,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count
        FROM payments
      `),
      db.query(`
        SELECT
          SUM(CASE WHEN status = 'delayed' THEN 1 ELSE 0 END) as delayed_stages,
          SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as active_stages
        FROM project_stages
      `)
    ]);

    res.json({
      projects: projects.rows[0],
      payments: payments.rows[0],
      stages: stages.rows[0]
    });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getProjectAnalytics = async (req, res) => {
  try {
    const [statusDist, monthlyTrend, stagePerformance, projectList] = await Promise.all([
      db.query(`SELECT status, COUNT(*) as count FROM projects GROUP BY status ORDER BY count DESC`),
      db.query(`
        SELECT
          strftime('%Y-%m', created_at) as month,
          COUNT(*) as created,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
        FROM projects
        WHERE created_at >= datetime('now', '-12 months')
        GROUP BY month ORDER BY month
      `),
      db.query(`
        SELECT
          stage_number, stage_name,
          COUNT(*) as total,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'delayed' THEN 1 ELSE 0 END) as delayed,
          AVG(CASE WHEN start_time IS NOT NULL AND end_time IS NOT NULL
              THEN (julianday(end_time) - julianday(start_time))
              END) as avg_days
        FROM project_stages
        GROUP BY stage_number, stage_name
        ORDER BY stage_number
      `),
      db.query(`
        SELECT
          p.id, p.project_number, p.customer_name, p.company_name,
          p.status, p.priority, p.current_stage, p.progress_percentage,
          p.total_value, p.expected_end_date, p.created_at,
          m.full_name as manager_name,
          COALESCE((SELECT SUM(amount) FROM payments WHERE project_id=p.id AND status='received'),0) as total_received
        FROM projects p
        LEFT JOIN users m ON p.assigned_manager = m.id
        ORDER BY p.created_at DESC
      `)
    ]);

    res.json({
      status_distribution: statusDist.rows,
      monthly_trend: monthlyTrend.rows,
      stage_performance: stagePerformance.rows,
      project_list: projectList.rows
    });
  } catch (err) {
    console.error('Project analytics error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const getPaymentAnalytics = async (req, res) => {
  try {
    const [summary, monthly, byType] = await Promise.all([
      db.query(`
        SELECT
          COALESCE(SUM(CASE WHEN status='received' THEN amount ELSE 0 END),0) as received,
          COALESCE(SUM(CASE WHEN status='pending' THEN amount ELSE 0 END),0) as pending,
          COALESCE(SUM(CASE WHEN status='overdue' THEN amount ELSE 0 END),0) as overdue
        FROM payments
      `),
      db.query(`
        SELECT
          strftime('%Y-%m', created_at) as month,
          COALESCE(SUM(CASE WHEN status='received' THEN amount ELSE 0 END),0) as received,
          COALESCE(SUM(CASE WHEN status='pending' THEN amount ELSE 0 END),0) as pending
        FROM payments
        WHERE created_at >= datetime('now', '-12 months')
        GROUP BY month ORDER BY month
      `),
      db.query(`SELECT payment_type, COUNT(*) as count, COALESCE(SUM(amount),0) as total FROM payments GROUP BY payment_type`)
    ]);

    res.json({
      summary: summary.rows[0],
      monthly_trend: monthly.rows,
      by_type: byType.rows
    });
  } catch (err) {
    console.error('Payment analytics error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const exportProjectsExcel = async (req, res) => {
  try {
    const projects = await db.query(`
      SELECT p.*, u.full_name as created_by_name, m.full_name as manager_name,
        COALESCE((SELECT SUM(amount) FROM payments WHERE project_id=p.id AND status='received'),0) as total_received,
        COALESCE((SELECT SUM(amount) FROM payments WHERE project_id=p.id AND status='pending'),0) as total_pending
      FROM projects p
      LEFT JOIN users u ON p.created_by = u.id
      LEFT JOIN users m ON p.assigned_manager = m.id
      ORDER BY p.created_at DESC
    `);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Projects');

    sheet.columns = [
      { header: 'Project No.', key: 'project_number', width: 18 },
      { header: 'Customer', key: 'customer_name', width: 20 },
      { header: 'Company', key: 'company_name', width: 25 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Stage', key: 'current_stage', width: 10 },
      { header: 'Progress %', key: 'progress_percentage', width: 12 },
      { header: 'Priority', key: 'priority', width: 12 },
      { header: 'Manager', key: 'manager_name', width: 20 },
      { header: 'Total Value', key: 'total_value', width: 15 },
      { header: 'Received', key: 'total_received', width: 15 },
      { header: 'Pending', key: 'total_pending', width: 15 },
      { header: 'Created', key: 'created_at', width: 18 },
    ];

    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };

    projects.rows.forEach(p => sheet.addRow(p));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=projects_report.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Export Excel error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

const exportProjectsPDF = async (req, res) => {
  try {
    const projects = await db.query(
      `SELECT project_number, customer_name, company_name, status, current_stage, progress_percentage, created_at
       FROM projects ORDER BY created_at DESC`
    );

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
    headers.forEach((h, i) => {
      doc.fillColor('white').fontSize(9).font('Helvetica-Bold').text(h, x + 3, headerY, { width: colWidths[i] });
      x += colWidths[i];
    });

    doc.fillColor('black').font('Helvetica').fontSize(8);
    projects.rows.forEach((p, idx) => {
      const y = doc.y + 4;
      if (idx % 2 === 0) doc.rect(40, y - 2, 600, 16).fill('#F8FAFC');
      doc.fillColor('black');
      x = 40;
      [p.project_number, p.customer_name, p.company_name, p.status,
       `${p.current_stage}/19`, `${p.progress_percentage}%`].forEach((val, i) => {
        doc.text(String(val || ''), x + 3, y, { width: colWidths[i] });
        x += colWidths[i];
      });
      doc.moveDown(0.3);
    });

    doc.end();
  } catch (err) {
    console.error('Export PDF error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = {
  getDashboardStats, getProjectAnalytics, getPaymentAnalytics,
  exportProjectsExcel, exportProjectsPDF
};
