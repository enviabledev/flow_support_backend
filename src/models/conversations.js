const pool = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const ConversationModel = {
  async findById(id) {
    const { rows } = await pool.query(`
      SELECT c.*,
        ct.phone_number, ct.display_name, ct.profile_image_url, ct.notes as contact_notes,
        s.name as assigned_to_name
      FROM conversations c
      JOIN contacts ct ON c.contact_id = ct.id
      LEFT JOIN staff s ON c.assigned_to = s.id
      WHERE c.id = $1
    `, [id]);
    return rows[0] || null;
  },

  async findByContactId(contactId) {
    const { rows } = await pool.query('SELECT * FROM conversations WHERE contact_id = $1', [contactId]);
    return rows[0] || null;
  },

  async findAll({ archived = false, search = '', staffId = null } = {}) {
    let query = `
      SELECT c.*,
        ct.phone_number, ct.display_name, ct.profile_image_url,
        s.name as assigned_to_name,
        lm.direction as last_message_direction,
        ls.name as last_message_sender_name,
        CASE WHEN sc.id IS NOT NULL THEN true ELSE false END as is_starred
      FROM conversations c
      JOIN contacts ct ON c.contact_id = ct.id
      LEFT JOIN staff s ON c.assigned_to = s.id
      LEFT JOIN messages lm ON lm.id = (
        SELECT id FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1
      )
      LEFT JOIN staff ls ON lm.sender_type = 'staff' AND lm.sender_id = ls.id
      LEFT JOIN starred_conversations sc ON sc.conversation_id = c.id AND sc.staff_id = $2
      WHERE c.is_archived = $1
    `;
    const params = [archived, staffId];
    let paramIndex = 3;

    if (search) {
      const pattern = `%${search}%`;
      query += ` AND (ct.display_name ILIKE $${paramIndex} OR ct.phone_number ILIKE $${paramIndex} OR c.last_message_text ILIKE $${paramIndex})`;
      params.push(pattern);
      paramIndex++;
    }

    query += ' ORDER BY c.last_message_at DESC NULLS LAST';
    const { rows } = await pool.query(query, params);
    return rows;
  },

  async create({ id, contact_id }) {
    await pool.query(
      'INSERT INTO conversations (id, contact_id) VALUES ($1, $2)',
      [id, contact_id]
    );
    return this.findById(id);
  },

  async findOrCreateByContact(contactId) {
    let conversation = await this.findByContactId(contactId);
    if (!conversation) {
      conversation = await this.create({ id: uuidv4(), contact_id: contactId });
    }
    return conversation;
  },

  async updateLastMessage(id, { text, timestamp }) {
    await pool.query(
      'UPDATE conversations SET last_message_text = $1, last_message_at = $2 WHERE id = $3',
      [text, timestamp, id]
    );
  },

  async updateLastInbound(id, timestamp) {
    await pool.query(
      'UPDATE conversations SET last_inbound_at = $1 WHERE id = $2',
      [timestamp, id]
    );
  },

  async incrementUnread(id) {
    await pool.query('UPDATE conversations SET unread_count = unread_count + 1 WHERE id = $1', [id]);
  },

  async markRead(id) {
    await pool.query('UPDATE conversations SET unread_count = 0 WHERE id = $1', [id]);
  },

  async update(id, fields) {
    const allowed = ['assigned_to', 'is_archived'];
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
      `UPDATE conversations SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );
    return this.findById(id);
  }
};

module.exports = ConversationModel;
