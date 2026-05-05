require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const db = new Database(path.join(__dirname, 'data/ams.db'));
db.pragma('foreign_keys = ON');

const STAGES = [
  { number: 1,  name: 'Customer Requirement',                    req_doc: 0, mand: 0 },
  { number: 2,  name: 'Customer Name & Company',                 req_doc: 0, mand: 0 },
  { number: 3,  name: 'Communication',                           req_doc: 0, mand: 0 },
  { number: 4,  name: 'Customer Type',                           req_doc: 0, mand: 0 },
  { number: 5,  name: 'Company Details + Vendor Registration',   req_doc: 1, mand: 0 },
  { number: 6,  name: 'NDA',                                     req_doc: 1, mand: 0 },
  { number: 7,  name: 'Customer Design Requirement',             req_doc: 1, mand: 0 },
  { number: 8,  name: 'SST Design + Quotation',                  req_doc: 1, mand: 0 },
  { number: 9,  name: 'Negotiation',                             req_doc: 1, mand: 0 },
  { number: 10, name: 'Purchase Order (Customer to SST)',        req_doc: 1, mand: 0 },
  { number: 11, name: 'PO Acknowledgement (SST to Customer)',    req_doc: 1, mand: 0 },
  { number: 12, name: 'Terms & Advance (Performa Invoice)',      req_doc: 1, mand: 0 },
  { number: 13, name: 'Payment Received',                        req_doc: 1, mand: 0 },
  { number: 14, name: 'Project Execution',                       req_doc: 0, mand: 0 },
  { number: 15, name: 'Delivery + Invoice',                      req_doc: 1, mand: 0 },
  { number: 16, name: 'Installation & Commissioning',            req_doc: 1, mand: 0 },
  { number: 17, name: 'Project Sign Up',                         req_doc: 1, mand: 1 },
  { number: 18, name: 'Balance Payment',                         req_doc: 1, mand: 0 },
  { number: 19, name: 'Project Closed',                          req_doc: 0, mand: 0 },
];

const adminUser = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
const adminId = adminUser.id;

const managerUser = db.prepare("SELECT id FROM users WHERE username = 'manager1'").get();
const managerId = managerUser.id;

// Create sample employee
let empId;
const empExists = db.prepare("SELECT id FROM users WHERE username = 'emp1'").get();
if (!empExists) {
  const hash = bcrypt.hashSync('Employee@123', 12);
  const r = db.prepare(`INSERT INTO users (username, email, password_hash, role, full_name, department)
    VALUES ('emp1','employee@sst.com',?,'employee','Arun Kumar','Engineering')`).run(hash);
  empId = r.lastInsertRowid;
  console.log('Employee created: emp1 / Employee@123');
} else {
  empId = empExists.id;
}

function createProject(data, stagesCompleted, stageComments) {
  const existing = db.prepare("SELECT id FROM projects WHERE project_number = ?").get(data.project_number);
  if (existing) {
    console.log(`Project ${data.project_number} already exists, skipping.`);
    return existing.id;
  }

  const r = db.prepare(`
    INSERT INTO projects (project_number, customer_name, company_name, communication_type,
      customer_type, reference, description, priority, created_by, assigned_manager,
      total_value, expected_end_date, current_stage, progress_percentage, status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    data.project_number, data.customer_name, data.company_name, data.communication_type,
    data.customer_type, data.reference || null, data.description, data.priority,
    adminId, managerId, data.total_value, data.expected_end_date,
    data.current_stage, data.progress_percentage, data.status
  );
  const projectId = r.lastInsertRowid;

  // Insert all 19 stages
  STAGES.forEach(stage => {
    let status = 'pending';
    let start_time = null;
    let end_time = null;
    let comments = null;

    if (stage.number < data.current_stage) {
      status = 'completed';
      start_time = `datetime('now', '-${(data.current_stage - stage.number + 2)} days')`;
      end_time = `datetime('now', '-${(data.current_stage - stage.number + 1)} days')`;
    } else if (stage.number === data.current_stage) {
      status = 'in_progress';
      start_time = `datetime('now', '-1 days')`;
    }

    const comment = stageComments?.[stage.number] || null;
    const assignedTo = stage.number <= data.current_stage ? (stage.number % 2 === 0 ? managerId : empId) : null;

    db.prepare(`
      INSERT INTO project_stages (project_id, stage_number, stage_name, status,
        assigned_to, start_time, end_time, comments, requires_document, is_mandatory_doc)
      VALUES (?,?,?,?,?,${start_time ? start_time : 'NULL'},${end_time ? end_time : 'NULL'},?,?,?)
    `).run(projectId, stage.number, stage.name, status, assignedTo, comment, stage.req_doc, stage.mand);
  });

  console.log(`✓ Project created: ${data.project_number} - ${data.customer_name}`);
  return projectId;
}

// ─────────────────────────────────────────────
// PROJECT 1: Active - Stage 8 (SST Design + Quotation)
// ─────────────────────────────────────────────
const p1Id = createProject({
  project_number: 'SST-2026-0001',
  customer_name: 'Rajesh Kumar',
  company_name: 'Infosys Technologies Ltd',
  communication_type: 'Mail',
  customer_type: 'New',
  reference: 'LinkedIn Contact',
  description: 'Custom industrial automation panel design and installation for manufacturing unit',
  priority: 'high',
  total_value: 850000,
  expected_end_date: '2026-08-30',
  current_stage: 8,
  progress_percentage: 37,
  status: 'active'
}, 8, {
  1: 'Customer requires automated control panel for 3 production lines',
  2: 'Rajesh Kumar, Infosys Technologies Ltd confirmed',
  3: 'Initial discussion via email, followed up on WhatsApp',
  5: 'Vendor registration documents submitted and approved',
  6: 'NDA signed by both parties on 2026-03-15',
  7: 'Customer requires 3-phase control panel with PLC integration',
});

// Add payments for project 1
const p1PayExists = db.prepare("SELECT id FROM payments WHERE project_id = ? AND payment_type = 'advance'").get(p1Id);
if (!p1PayExists) {
  db.prepare(`INSERT INTO payments (project_id, payment_type, amount, currency, status, received_date, notes, reference_number, created_by)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(p1Id, 'advance', 170000, 'INR', 'received', '2026-03-20',
    'Advance payment 20% received via NEFT', 'NEFT-20260320-001', adminId);

  db.prepare(`INSERT INTO payments (project_id, payment_type, amount, currency, status, due_date, notes, created_by)
    VALUES (?,?,?,?,?,?,?,?)`).run(p1Id, 'balance', 680000, 'INR', 'pending', '2026-08-30',
    'Balance payment on project completion', adminId);

  console.log('✓ Payments added for Project 1');
}

// ─────────────────────────────────────────────
// PROJECT 2: Completed - All 19 stages done
// ─────────────────────────────────────────────
const p2Id = createProject({
  project_number: 'SST-2026-0002',
  customer_name: 'Priya Sharma',
  company_name: 'Tata Motors Ltd',
  communication_type: 'Call',
  customer_type: 'Existing',
  reference: null,
  description: 'Electrical panel upgrade and commissioning for assembly line B at Pune facility',
  priority: 'critical',
  total_value: 1250000,
  expected_end_date: '2026-04-01',
  current_stage: 19,
  progress_percentage: 100,
  status: 'completed'
}, 19, {
  1: 'Existing customer - panel upgrade for assembly line B',
  8: 'Quotation approved for ₹12.5 Lakhs',
  9: 'Final negotiation - 5% discount applied',
  13: 'Full advance received ₹3,75,000',
  14: 'Execution completed in 45 days as per schedule',
  17: 'Project sign-off document signed by client on 2026-04-01',
  18: 'Balance payment ₹8,75,000 received on 2026-04-02',
  19: 'Project successfully closed'
});

// Add payments for project 2
const p2PayExists = db.prepare("SELECT id FROM payments WHERE project_id = ? AND payment_type = 'advance'").get(p2Id);
if (!p2PayExists) {
  db.prepare(`INSERT INTO payments (project_id, payment_type, amount, currency, status, received_date, notes, reference_number, created_by)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(p2Id, 'advance', 375000, 'INR', 'received', '2026-02-10',
    'Advance 30% received', 'RTGS-20260210-045', adminId);

  db.prepare(`INSERT INTO payments (project_id, payment_type, amount, currency, status, received_date, notes, reference_number, created_by)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(p2Id, 'balance', 875000, 'INR', 'received', '2026-04-02',
    'Balance payment received after project sign-off', 'RTGS-20260402-012', adminId);

  console.log('✓ Payments added for Project 2');
}

console.log('\n✅ Sample data seeded successfully!');
console.log('   Project 1: SST-2026-0001 (Active - Stage 8/19)');
console.log('   Project 2: SST-2026-0002 (Completed - 100%)');
db.close();
