require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

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

async function initPostgres() {
  const client = await pool.connect();
  try {
    console.log('Connected to PostgreSQL. Running schema...');
    const schema = fs.readFileSync(path.join(__dirname, 'schema-pg.sql'), 'utf8');
    await client.query(schema);
    console.log('Schema created.');

    const adminRes = await client.query("SELECT id FROM users WHERE username = 'admin'");
    if (!adminRes.rows.length) {
      const hash = await bcrypt.hash('Admin@123', 12);
      await client.query(
        `INSERT INTO users (username, email, password_hash, role, full_name) VALUES ('admin', 'admin@sst.com', $1, 'admin', 'System Administrator')`,
        [hash]
      );
      console.log('Admin created: admin / Admin@123');
    }

    const mgrRes = await client.query("SELECT id FROM users WHERE username = 'manager1'");
    if (!mgrRes.rows.length) {
      const hash = await bcrypt.hash('Manager@123', 12);
      await client.query(
        `INSERT INTO users (username, email, password_hash, role, full_name, department) VALUES ('manager1', 'manager@sst.com', $1, 'manager', 'Project Manager', 'Engineering')`,
        [hash]
      );
      console.log('Manager created: manager1 / Manager@123');
    }

    console.log('PostgreSQL database ready!');
  } finally {
    client.release();
    await pool.end();
  }
}

initPostgres().catch(err => {
  console.error('PG init failed:', err.message);
  process.exit(1);
});
