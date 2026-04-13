const pool = require('../config/database');

const StaffModel = {
  async findByEmail(email) {
    const { rows } = await pool.query('SELECT * FROM staff WHERE email = $1', [email]);
    return rows[0] || null;
  },

  async findById(id) {
    const { rows } = await pool.query(
      'SELECT id, name, email, role, avatar_url, is_active, created_at FROM staff WHERE id = $1',
      [id]
    );
    return rows[0] || null;
  },

  async findAll() {
    const { rows } = await pool.query(
      'SELECT id, name, email, role, avatar_url, is_active, created_at FROM staff ORDER BY name'
    );
    return rows;
  },

  async create({ id, name, email, password_hash, role = 'agent' }) {
    await pool.query(
      'INSERT INTO staff (id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5)',
      [id, name, email, password_hash, role]
    );
    return this.findById(id);
  },

  async update(id, fields) {
    const allowed = ['name', 'email', 'avatar_url', 'role', 'is_active'];
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

    values.push(id);
    await pool.query(
      `UPDATE staff SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );
    return this.findById(id);
  }
};

module.exports = StaffModel;
