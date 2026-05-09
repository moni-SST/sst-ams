// One-time migration: upload all local files to Cloudinary and update Render PostgreSQL
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const Database = require('better-sqlite3');
const { Pool } = require('pg');
const cloudinary = require('cloudinary').v2;

// Get Render DATABASE_URL from arg or env
const RENDER_DB_URL = process.argv[2] || process.env.RENDER_DATABASE_URL;
if (!RENDER_DB_URL) {
  console.error('Usage: node migrate-files-to-cloudinary.js <RENDER_DATABASE_URL>');
  console.error('  Or set RENDER_DATABASE_URL env var');
  process.exit(1);
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const localDb = new Database(path.join(__dirname, 'data', 'ams.db'), { readonly: true });
const pgPool = new Pool({ connectionString: RENDER_DB_URL, ssl: { rejectUnauthorized: false } });

const uploadBuffer = (buffer, options) => new Promise((resolve, reject) => {
  const stream = cloudinary.uploader.upload_stream(
    { resource_type: 'auto', ...options },
    (err, result) => err ? reject(err) : resolve(result)
  );
  stream.end(buffer);
});

(async () => {
  // 1. Get all local docs that have valid file paths
  const localDocs = localDb.prepare('SELECT * FROM documents ORDER BY id').all();
  console.log(`Found ${localDocs.length} local documents`);

  let uploaded = 0, skipped = 0, missing = 0;
  for (const doc of localDocs) {
    const filePath = path.isAbsolute(doc.storage_path)
      ? doc.storage_path
      : path.join(__dirname, doc.storage_path);

    if (!fs.existsSync(filePath)) {
      console.log(`  [${doc.id}] MISSING: ${doc.original_name} (${filePath})`);
      missing++;
      continue;
    }

    if (/^https?:\/\//i.test(doc.storage_path)) {
      console.log(`  [${doc.id}] Already cloud: ${doc.original_name}`);
      skipped++;
      continue;
    }

    try {
      const ext = path.extname(doc.original_name).toLowerCase();
      const buffer = fs.readFileSync(filePath);
      const publicId = `sst-ams/projects/${doc.project_id}/${uuidv4()}`;
      const resourceType = ['.pdf','.doc','.docx','.xls','.xlsx','.msg'].includes(ext) ? 'raw' : 'auto';

      const result = await uploadBuffer(buffer, { public_id: publicId, resource_type: resourceType });

      // Check if doc exists in Render DB by id
      const checkRes = await pgPool.query('SELECT id FROM documents WHERE id = $1', [doc.id]);
      if (checkRes.rows.length === 0) {
        // Insert new record on Render
        await pgPool.query(
          `INSERT INTO documents (id, project_id, stage_id, stage_number, file_name, original_name, file_type, file_size, storage_path, description, uploaded_by, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [doc.id, doc.project_id, doc.stage_id, doc.stage_number, result.public_id,
           doc.original_name, doc.file_type, doc.file_size, result.secure_url,
           doc.description, doc.uploaded_by, doc.created_at]
        );
        console.log(`  [${doc.id}] INSERTED: ${doc.original_name}`);
      } else {
        // Update existing record
        await pgPool.query(
          `UPDATE documents SET file_name = $1, storage_path = $2 WHERE id = $3`,
          [result.public_id, result.secure_url, doc.id]
        );
        console.log(`  [${doc.id}] UPDATED: ${doc.original_name}`);
      }
      uploaded++;
    } catch (err) {
      console.error(`  [${doc.id}] FAILED: ${doc.original_name} - ${err.message}`);
    }
  }

  // Reset PostgreSQL serial sequence so future inserts don't collide
  try {
    await pgPool.query(`SELECT setval(pg_get_serial_sequence('documents', 'id'), COALESCE((SELECT MAX(id) FROM documents), 1))`);
  } catch (e) { console.error('Sequence reset:', e.message); }

  console.log(`\nDONE: ${uploaded} uploaded, ${skipped} skipped, ${missing} missing`);
  await pgPool.end();
  localDb.close();
})();
