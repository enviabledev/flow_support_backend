const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const ContactModel = {
  async findById(id) {
    const { rows } = await pool.query('SELECT * FROM contacts WHERE id = $1', [id]);
    return rows[0] || null;
  },

  async findByPhone(phoneNumber) {
    const { rows } = await pool.query('SELECT * FROM contacts WHERE phone_number = $1', [phoneNumber]);
    return rows[0] || null;
  },

  async findAll(search = '') {
    if (search) {
      const pattern = `%${search}%`;
      const { rows } = await pool.query(
        'SELECT * FROM contacts WHERE display_name ILIKE $1 OR phone_number ILIKE $1 ORDER BY display_name',
        [pattern]
      );
      return rows;
    }
    const { rows } = await pool.query('SELECT * FROM contacts ORDER BY display_name');
    return rows;
  },

  async create({ id, phone_number, display_name }) {
    await pool.query(
      'INSERT INTO contacts (id, phone_number, display_name) VALUES ($1, $2, $3)',
      [id, phone_number, display_name || phone_number]
    );
    return this.findById(id);
  },

  async findOrCreate(phoneNumber) {
    let contact = await this.findByPhone(phoneNumber);
    if (!contact) {
      contact = await this.create({
        id: uuidv4(),
        phone_number: phoneNumber,
        display_name: phoneNumber
      });
    }
    return contact;
  },

  async update(id, fields) {
    const allowed = ['display_name', 'profile_image_url', 'notes', 'company', 'email', 'address', 'tags'];
    const updates = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(fields)) {
      if (allowed.includes(key)) {
        updates.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (updates.length === 0) return this.findById(id);

    updates.push(`updated_at = now()`);
    values.push(id);
    await pool.query(
      `UPDATE contacts SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );
    return this.findById(id);
  }
};

module.exports = ContactModel;
