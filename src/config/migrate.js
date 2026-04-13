const pool = require('./database');
const fs = require('fs');
const path = require('path');

async function runMigrations() {
  const migrationsDir = path.join(__dirname, '../../migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    try {
      await pool.query(sql);
    } catch (err) {
      // Tables/columns already exist — safe to skip
      if (err.code === '42P07' || err.code === '42701') {
        // 42P07 = table exists, 42701 = column exists
      } else {
        throw err;
      }
    }
  }

  console.log('Migrations completed successfully');
}

module.exports = runMigrations;
