const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../config/database');
const MessageModel = require('../models/messages');
const ConversationModel = require('../models/conversations');
const TwilioService = require('../services/twilioService');
const SocketService = require('../services/socketService');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.use(authenticateToken);

router.post('/', async (req, res) => {
  const { body, conversationIds, mediaUrl } = req.body;
  const staffId = req.user.id;
  const staffName = req.user.name;

  if (!conversationIds || conversationIds.length === 0) {
    return res.status(400).json({ error: 'No conversations selected' });
  }

  if (!body && !mediaUrl) {
    return res.status(400).json({ error: 'Message body or media required' });
  }

  const results = {
    sent: [],
    skipped: [],
    failed: [],
  };

  for (const conversationId of conversationIds) {
    try {
      const conversation = await ConversationModel.findById(conversationId);
      if (!conversation) {
        results.failed.push({ conversationId, error: 'Conversation not found' });
        continue;
      }

      // Check 24-hour messaging window
      const { rows: windowRows } = await pool.query(
        'SELECT MAX(created_at) as last_inbound FROM messages WHERE conversation_id = $1 AND direction = $2',
        [conversationId, 'inbound']
      );
      const lastInbound = windowRows[0]?.last_inbound;
      const windowExpired = !lastInbound || (Date.now() - new Date(lastInbound).getTime()) >= 23 * 60 * 60 * 1000;

      if (windowExpired) {
        results.skipped.push({
          conversationId,
          contactName: conversation.display_name || conversation.phone_number,
          reason: '24h window expired',
        });
        continue;
      }

      // Send via Twilio
      const twilioMsg = await TwilioService.sendWhatsAppMessage({
        to: conversation.phone_number,
        body: body || '',
        mediaUrl,
      });

      // Store in database
      const messageId = uuidv4();
      const message = await MessageModel.create({
        id: messageId,
        conversation_id: conversationId,
        twilio_sid: twilioMsg.sid,
        direction: 'outbound',
        sender_type: 'staff',
        sender_id: staffId,
        body: body || '',
        media_url: mediaUrl || null,
        media_content_type: null,
        status: 'sent',
      });

      // Update conversation
      const now = new Date().toISOString();
      await ConversationModel.updateLastMessage(conversationId, {
        text: body || '',
        timestamp: now,
      });

      // Auto-assign if unassigned
      if (!conversation.assigned_to) {
        await ConversationModel.update(conversationId, { assigned_to: staffId });
      }

      const updatedConversation = await ConversationModel.findById(conversationId);

      // Emit socket event with sender info
      SocketService.emitNewMessage(
        { ...message, sender_name: staffName, sender_email: req.user.email },
        updatedConversation
      );

      results.sent.push({
        conversationId,
        contactName: conversation.display_name || conversation.phone_number,
        messageId: message.id,
      });

      // Small delay between sends to avoid rate limiting
      if (conversationIds.indexOf(conversationId) < conversationIds.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    } catch (err) {
      console.error(`Broadcast failed for ${conversationId}:`, err.message);
      results.failed.push({ conversationId, error: err.message });
    }
  }

  res.json({
    total: conversationIds.length,
    sent: results.sent.length,
    skipped: results.skipped.length,
    failed: results.failed.length,
    results,
  });
});

module.exports = router;
