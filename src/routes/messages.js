const express = require('express');
const pool = require('../config/database');
const MessageModel = require('../models/messages');
const MessageService = require('../services/messageService');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.use(authenticateToken);

router.get('/:conversationId/messages', async (req, res) => {
  try {
    const { cursor, limit } = req.query;
    const messages = await MessageModel.findByConversation(req.params.conversationId, {
      cursor,
      limit: limit ? parseInt(limit) : 50
    });
    res.json({
      messages,
      nextCursor: messages.length > 0 ? messages[messages.length - 1].created_at : null
    });
  } catch (error) {
    console.error('List messages error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:conversationId/messages/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ error: 'Search query required' });
    }
    const messages = await MessageModel.searchByConversation(req.params.conversationId, q);
    res.json({ messages });
  } catch (error) {
    console.error('Search messages error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:conversationId/messages', async (req, res) => {
  try {
    const { body, mediaUrl, mediaContentType, replyToId } = req.body;

    if (!body && !mediaUrl) {
      return res.status(400).json({ error: 'Message body or media required' });
    }

    // Check 24-hour messaging window
    const { rows: windowRows } = await pool.query(
      'SELECT MAX(created_at) as last_inbound FROM messages WHERE conversation_id = $1 AND direction = $2',
      [req.params.conversationId, 'inbound']
    );
    const lastInbound = windowRows[0]?.last_inbound;
    const windowExpired = !lastInbound || (Date.now() - new Date(lastInbound).getTime()) >= 23 * 60 * 60 * 1000;

    if (windowExpired) {
      console.log(`24h window BLOCKED: conversation=${req.params.conversationId}, lastInbound=${lastInbound}`);
      return res.status(400).json({ error: '24h window expired', windowExpired: true });
    }
    console.log(`24h window OK: conversation=${req.params.conversationId}, lastInbound=${lastInbound}`);

    const message = await MessageService.sendMessage({
      conversationId: req.params.conversationId,
      body: body || '',
      mediaUrl,
      mediaContentType,
      replyToId,
      staffId: req.user.id
    });

    res.status(201).json({ message });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      error: 'Failed to send message',
      details: error.message
    });
  }
});

module.exports = router;
