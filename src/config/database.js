const { Pool, types } = require('pg');

// Force TIMESTAMPTZ (OID 1184) to always return ISO 8601 UTC strings
types.setTypeParser(1184, (val) => {
  if (!val) return null;
  return new Date(val).toISOString();
});

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

module.exports = pool;
