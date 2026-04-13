const pool = require('../config/database');

const MessageModel = {
  async findById(id) {
    const { rows } = await pool.query('SELECT * FROM messages WHERE id = $1', [id]);
    return rows[0] || null;
  },

  async findByTwilioSid(sid) {
    const { rows } = await pool.query('SELECT * FROM messages WHERE twilio_sid = $1', [sid]);
    return rows[0] || null;
  },

  async findByConversation(conversationId, { cursor, limit = 50 } = {}) {
    let query = `
      SELECT m.*,
        s.name as sender_name,
        s.email as sender_email,
        rm.body as reply_body,
        rm.sender_type as reply_sender_type,
        rm.media_url as reply_media_url,
        rm.media_content_type as reply_media_content_type,
        CASE
          WHEN rm.sender_type = 'contact' THEN (SELECT display_name FROM contacts WHERE id = (SELECT contact_id FROM conversations WHERE id = m.conversation_id))
          WHEN rm.sender_type = 'staff' THEN (SELECT name FROM staff WHERE id = rm.sender_id)
          ELSE NULL
        END as reply_sender_name
      FROM messages m
      LEFT JOIN staff s ON m.sender_type = 'staff' AND m.sender_id = s.id
      LEFT JOIN messages rm ON m.reply_to_id = rm.id
      WHERE m.conversation_id = $1`;
    const params = [conversationId];
    let paramIndex = 2;

    if (cursor) {
      query += ` AND m.created_at < $${paramIndex}`;
      params.push(cursor);
      paramIndex++;
    }

    query += ` ORDER BY m.created_at DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const { rows } = await pool.query(query, params);
    return rows;
  },

  async searchByConversation(conversationId, searchQuery) {
    const { rows } = await pool.query(
      'SELECT * FROM messages WHERE conversation_id = $1 AND body ILIKE $2 ORDER BY created_at DESC LIMIT 100',
      [conversationId, `%${searchQuery}%`]
    );
    return rows;
  },

  async create({ id, conversation_id, twilio_sid, direction, sender_type, sender_id, body, media_url, media_content_type, reply_to_id, status = 'sent' }) {
    await pool.query(`
      INSERT INTO messages (id, conversation_id, twilio_sid, direction, sender_type, sender_id, body, media_url, media_content_type, reply_to_id, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [id, conversation_id, twilio_sid, direction, sender_type, sender_id, body, media_url, media_content_type, reply_to_id, status]);
    return this.findById(id);
  },

  async updateStatus(id, status) {
    // Atomic priority enforcement — prevents race conditions between concurrent webhooks.
    // Only update if the new status has higher priority than the current one.
    const PRIORITY_SQL = "CASE status WHEN 'queued' THEN 0 WHEN 'sent' THEN 1 WHEN 'delivered' THEN 2 WHEN 'read' THEN 3 WHEN 'failed' THEN 4 WHEN 'undelivered' THEN 5 ELSE -1 END";
    const NEW_PRIORITY_SQL = `CASE $1 WHEN 'queued' THEN 0 WHEN 'sent' THEN 1 WHEN 'delivered' THEN 2 WHEN 'read' THEN 3 WHEN 'failed' THEN 4 WHEN 'undelivered' THEN 5 ELSE -1 END`;
    await pool.query(
      `UPDATE messages SET status = $1 WHERE id = $2 AND (${NEW_PRIORITY_SQL}) > (${PRIORITY_SQL})`,
      [status, id]
    );
    return this.findById(id);
  },

  async updateTwilioSid(id, twilioSid, status) {
    await pool.query('UPDATE messages SET twilio_sid = $1, status = $2 WHERE id = $3', [twilioSid, status, id]);
    return this.findById(id);
  },

  async createStatusLog({ id, message_id, status, error_code, error_message }) {
    await pool.query(`
      INSERT INTO message_status_log (id, message_id, status, error_code, error_message)
      VALUES ($1, $2, $3, $4, $5)
    `, [id, message_id, status, error_code, error_message]);
  }
};

module.exports = MessageModel;
