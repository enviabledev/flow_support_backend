// Seed script: runs migrations and creates a default admin user
// Run with: node src/config/initDb.js

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const pool = require('./database');
const runMigrations = require('./migrate');

async function seed() {
  console.log('Initializing database...');

  await runMigrations();

  // Check if admin already exists
  const { rows } = await pool.query('SELECT id FROM staff WHERE email = $1', ['admin@enviable.com']);
  if (rows.length > 0) {
    console.log('Admin user already exists. Skipping seed.');
    await pool.end();
    return;
  }

  const passwordHash = await bcrypt.hash('admin123', 10);

  await pool.query(
    'INSERT INTO staff (id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5)',
    [uuidv4(), 'Admin', 'admin@enviable.com', passwordHash, 'admin']
  );

  console.log('Created default admin user:');
  console.log('  Email: admin@enviable.com');
  console.log('  Password: admin123');
  console.log('  (Change this password immediately!)');

  // Create a sample contact and conversation for testing
  const contactId = uuidv4();
  const conversationId = uuidv4();

  await pool.query(
    'INSERT INTO contacts (id, phone_number, display_name) VALUES ($1, $2, $3)',
    [contactId, '+2348012345678', 'John Doe']
  );

  await pool.query(
    'INSERT INTO conversations (id, contact_id, last_message_text, last_message_at) VALUES ($1, $2, $3, now())',
    [conversationId, contactId, 'Hello, I need a transport quote']
  );

  await pool.query(
    'INSERT INTO messages (id, conversation_id, direction, sender_type, body, status) VALUES ($1, $2, $3, $4, $5, $6)',
    [uuidv4(), conversationId, 'inbound', 'contact', 'Hello, I need a transport quote', 'delivered']
  );

  console.log('Created sample contact and conversation for testing.');
  console.log('Database initialization complete!');

  await pool.end();
}

seed().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});
