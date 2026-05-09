// Supports both PostgreSQL (cloud via DATABASE_URL) and SQLite (local dev)

if (process.env.DATABASE_URL) {
  // ── PostgreSQL mode (Neon / Render) ──────────────────────────────────────
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  // Convert SQLite ? placeholders to PostgreSQL $1, $2, ... and fix SQLite-specific syntax
  const convertQuery = (text) => {
    let i = 0;
    let sql = text.replace(/\?/g, () => `$${++i}`);
    // datetime('now') → text format (since *_at columns are TEXT in schema-pg.sql)
    sql = sql.replace(/datetime\('now'\)/gi, "TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS')");
    // strftime('%Y-%m', col) → TO_CHAR(col, 'YYYY-MM') etc.
    sql = sql.replace(/strftime\(\s*'([^']+)'\s*,\s*([^)]+)\)/gi, (_, fmt, col) => {
      const pgFmt = fmt
        .replace(/%Y/g, 'YYYY').replace(/%m/g, 'MM').replace(/%d/g, 'DD')
        .replace(/%H/g, 'HH24').replace(/%M/g, 'MI').replace(/%S/g, 'SS');
      return `TO_CHAR(${col.trim()}::timestamp, '${pgFmt}')`;
    });
    // datetime('now', '-12 months') → TO_CHAR(NOW() - INTERVAL '12 months', 'YYYY-MM-DD HH24:MI:SS')
    // (text format so it can compare with TEXT-typed created_at columns)
    sql = sql.replace(/datetime\(\s*'now'\s*,\s*'([+-]?\d+)\s+(\w+)'\s*\)/gi,
      (_, n, unit) => `TO_CHAR(NOW() ${n.startsWith('-') ? '-' : '+'} INTERVAL '${n.replace(/[+-]/, '')} ${unit}', 'YYYY-MM-DD HH24:MI:SS')`);
    // julianday(a) - julianday(b) → EXTRACT(EPOCH FROM (a::timestamp - b::timestamp))/86400
    sql = sql.replace(/julianday\(([^)]+)\)\s*-\s*julianday\(([^)]+)\)/gi,
      (_, a, b) => `EXTRACT(EPOCH FROM (${a.trim()}::timestamp - ${b.trim()}::timestamp))/86400`);
    return sql;
  };
  const query = (text, params = []) => pool.query(convertQuery(text), params);
  const getClient = async () => {
    const client = await pool.connect();
    const originalQuery = client.query.bind(client);
    client.query = (text, params = []) => {
      if (typeof text === 'string') return originalQuery(convertQuery(text), params);
      return originalQuery(text, params);
    };
    return client;
  };

  module.exports = { query, getClient, db: null };

} else {
  // ── SQLite mode (local dev) ───────────────────────────────────────────────
  const Database = require('better-sqlite3');
  const path = require('path');
  const fs = require('fs');

  const dbDir = path.join(__dirname, '../../data');
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

  const dbPath = path.join(dbDir, 'ams.db');
  const db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const query = (text, params = []) => {
    try {
      const sql = text.replace(/\$\d+/g, '?');
      const trimmed = sql.trim().toUpperCase();

      if (trimmed.startsWith('SELECT') || trimmed.startsWith('WITH')) {
        const stmt = db.prepare(sql);
        const rows = stmt.all(...params);
        return Promise.resolve({ rows });
      } else if (trimmed.startsWith('INSERT')) {
        const returningMatch = sql.match(/RETURNING\s+([\s\S]+)$/i);
        if (returningMatch) {
          const insertSql = sql.replace(/\s+RETURNING[\s\S]+$/i, '');
          const stmt = db.prepare(insertSql);
          const info = stmt.run(...params);
          const lastId = info.lastInsertRowid;
          const cols = returningMatch[1].trim();
          if (cols === '*') {
            const tableMatch = insertSql.match(/INSERT\s+INTO\s+(\w+)/i);
            if (tableMatch) {
              const row = db.prepare(`SELECT * FROM ${tableMatch[1]} WHERE rowid = ?`).get(lastId);
              return Promise.resolve({ rows: row ? [row] : [] });
            }
          }
          const tableMatch = insertSql.match(/INSERT\s+INTO\s+(\w+)/i);
          if (tableMatch) {
            const row = db.prepare(`SELECT ${cols} FROM ${tableMatch[1]} WHERE rowid = ?`).get(lastId);
            return Promise.resolve({ rows: row ? [row] : [] });
          }
          return Promise.resolve({ rows: [{ id: lastId }] });
        } else {
          const stmt = db.prepare(sql);
          const info = stmt.run(...params);
          return Promise.resolve({ rows: [], rowCount: info.changes });
        }
      } else if (trimmed.startsWith('UPDATE') || trimmed.startsWith('DELETE')) {
        const returningMatch = sql.match(/RETURNING\s+([\s\S]+)$/i);
        if (returningMatch) {
          const mainSql = sql.replace(/\s+RETURNING[\s\S]+$/i, '');
          const stmt = db.prepare(mainSql);
          stmt.run(...params);
          const tableMatch = mainSql.match(/(?:UPDATE|DELETE\s+FROM)\s+(\w+)/i);
          if (tableMatch) {
            const cols = returningMatch[1].trim();
            const wherePart = mainSql.replace(/^UPDATE\s+\w+\s+SET\s+[\s\S]+?(?=WHERE|$)/i, '').replace(/^DELETE\s+FROM\s+\w+/i, '');
            const selectSql = `SELECT ${cols} FROM ${tableMatch[1]} ${wherePart}`;
            try {
              const rows = db.prepare(selectSql).all(...params);
              return Promise.resolve({ rows });
            } catch {
              return Promise.resolve({ rows: [] });
            }
          }
          return Promise.resolve({ rows: [] });
        }
        const stmt = db.prepare(sql);
        const info = stmt.run(...params);
        return Promise.resolve({ rows: [], rowCount: info.changes });
      } else {
        db.exec(text);
        return Promise.resolve({ rows: [] });
      }
    } catch (err) {
      return Promise.reject(err);
    }
  };

  const getClient = () => {
    const client = { query, release: () => {} };
    let inTransaction = false;
    client.query = (text, params = []) => {
      if (text.trim() === 'BEGIN') { if (!inTransaction) { db.prepare('BEGIN').run(); inTransaction = true; } return Promise.resolve({ rows: [] }); }
      if (text.trim() === 'COMMIT') { if (inTransaction) { db.prepare('COMMIT').run(); inTransaction = false; } return Promise.resolve({ rows: [] }); }
      if (text.trim() === 'ROLLBACK') { if (inTransaction) { db.prepare('ROLLBACK').run(); inTransaction = false; } return Promise.resolve({ rows: [] }); }
      return query(text, params);
    };
    return Promise.resolve(client);
  };

  module.exports = { query, getClient, db };
}
