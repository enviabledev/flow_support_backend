const express = require('express');
const pool = require('../config/database');
const ConversationModel = require('../models/conversations');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.use(authenticateToken);

// Lightweight sync — only conversations updated since a given timestamp
router.get('/sync', async (req, res) => {
  try {
    const { since } = req.query;
    if (!since) return res.status(400).json({ error: 'since parameter required' });

    const result = await pool.query(
      `SELECT c.*,
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
      WHERE c.last_message_at > $1
      ORDER BY c.last_message_at DESC`,
      [since, req.user.id]
    );

    res.json({ conversations: result.rows });
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/', async (req, res) => {
  try {
    const { search, archived } = req.query;
    const conversations = await ConversationModel.findAll({
      search,
      archived: archived === 'true',
      staffId: req.user.id,
    });
    res.json({ conversations });
  } catch (error) {
    console.error('List conversations error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { contactId } = req.body;
    if (!contactId) {
      return res.status(400).json({ error: 'contactId required' });
    }
    const conversation = await ConversationModel.findOrCreateByContact(contactId);
    res.status(201).json({ conversation });
  } catch (error) {
    console.error('Create conversation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const conversation = await ConversationModel.findById(req.params.id);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    res.json({ conversation });
  } catch (error) {
    console.error('Get conversation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    // Handle unread_count separately since it's not in the allowed fields
    if (req.body.unread_count !== undefined) {
      await pool.query(
        'UPDATE conversations SET unread_count = $1 WHERE id = $2',
        [req.body.unread_count, req.params.id]
      );
    }
    const conversation = await ConversationModel.update(req.params.id, req.body);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    res.json({ conversation });
  } catch (error) {
    console.error('Update conversation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/:id/read', async (req, res) => {
  try {
    await ConversationModel.markRead(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Star / unstar conversations (per-staff)
router.post('/:id/star', async (req, res) => {
  try {
    await pool.query(
      `INSERT INTO starred_conversations (staff_id, conversation_id)
       VALUES ($1, $2) ON CONFLICT (staff_id, conversation_id) DO NOTHING`,
      [req.user.id, req.params.id]
    );
    res.json({ starred: true });
  } catch (error) {
    console.error('Star error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id/star', async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM starred_conversations WHERE staff_id = $1 AND conversation_id = $2',
      [req.user.id, req.params.id]
    );
    res.json({ starred: false });
  } catch (error) {
    console.error('Unstar error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
