require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

// Use SQLite directly for init
const Database = require('better-sqlite3');
const dbDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
const db = new Database(path.join(dbDir, 'ams.db'));
db.pragma('foreign_keys = ON');

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
  { number: 10, name: 'Purchase Order (Customer → SST)',         requires_document: 1, is_mandatory_doc: 0 },
  { number: 11, name: 'PO Acknowledgement (SST → Customer)',     requires_document: 1, is_mandatory_doc: 0 },
  { number: 12, name: 'Terms & Advance (Performa Invoice)',      requires_document: 1, is_mandatory_doc: 0 },
  { number: 13, name: 'Payment Received',                        requires_document: 1, is_mandatory_doc: 0 },
  { number: 14, name: 'Project Execution',                       requires_document: 0, is_mandatory_doc: 0 },
  { number: 15, name: 'Delivery + Invoice',                      requires_document: 1, is_mandatory_doc: 0 },
  { number: 16, name: 'Installation & Commissioning',            requires_document: 1, is_mandatory_doc: 0 },
  { number: 17, name: 'Project Sign Up',                         requires_document: 1, is_mandatory_doc: 1 },
  { number: 18, name: 'Balance Payment',                         requires_document: 1, is_mandatory_doc: 0 },
  { number: 19, name: 'Project Closed',                          requires_document: 0, is_mandatory_doc: 0 },
];

async function initDatabase() {
  console.log('Initializing SQLite database...');

  // Run schema
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  console.log('Schema created successfully');

  // Create default admin user
  const adminExists = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
  if (!adminExists) {
    const hash = await bcrypt.hash('Admin@123', 12);
    db.prepare(
      `INSERT INTO users (username, email, password_hash, role, full_name)
       VALUES ('admin', 'admin@sst.com', ?, 'admin', 'System Administrator')`
    ).run(hash);
    console.log('Default admin created: admin / Admin@123');
  }

  // Create sample manager
  const managerExists = db.prepare("SELECT id FROM users WHERE username = 'manager1'").get();
  if (!managerExists) {
    const hash = await bcrypt.hash('Manager@123', 12);
    db.prepare(
      `INSERT INTO users (username, email, password_hash, role, full_name, department)
       VALUES ('manager1', 'manager@sst.com', ?, 'manager', 'Project Manager', 'Engineering')`
    ).run(hash);
    console.log('Sample manager created: manager1 / Manager@123');
  }

  console.log('\nDatabase initialized successfully!');
  console.log('DB location: backend/data/ams.db');
  db.close();
  process.exit(0);
}

initDatabase().catch(err => {
  console.error('Database init failed:', err);
  process.exit(1);
});

module.exports = { STAGE_DEFINITIONS };
