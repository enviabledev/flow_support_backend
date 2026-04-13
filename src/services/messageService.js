const { v4: uuidv4 } = require('uuid');
const MessageModel = require('../models/messages');
const ConversationModel = require('../models/conversations');
const ContactModel = require('../models/contacts');
const TwilioService = require('./twilioService');
const PushService = require('./pushService');
const SocketService = require('./socketService');

const StaffModel = require('../models/staff');

const MessageService = {
  async sendMessage({ conversationId, body, mediaUrl, mediaContentType, replyToId, staffId }) {
    const conversation = await ConversationModel.findById(conversationId);
    if (!conversation) {
      throw new Error('Conversation not found');
    }

    const messageId = uuidv4();
    const now = new Date().toISOString();

    // Store message as queued
    const message = await MessageModel.create({
      id: messageId,
      conversation_id: conversationId,
      direction: 'outbound',
      sender_type: 'staff',
      sender_id: staffId,
      body,
      media_url: mediaUrl || null,
      media_content_type: mediaContentType || null,
      reply_to_id: replyToId || null,
      status: 'queued'
    });

    // Update conversation preview — always show media type when media is present
    let previewText = body || '';
    if (mediaUrl) {
      let mediaLabel = '📎 Document';
      if (mediaContentType) {
        if (mediaContentType.startsWith('image/')) mediaLabel = '📷 Photo';
        else if (mediaContentType.startsWith('audio/')) mediaLabel = '🎵 Voice message';
        else if (mediaContentType.startsWith('video/')) mediaLabel = '🎥 Video';
      }
      // Strip WhatsApp markdown quote from preview if present
      let cleanBody = previewText;
      if (cleanBody.startsWith('> _"')) {
        const parts = cleanBody.split('\n\n');
        cleanBody = parts.length >= 2 ? parts.slice(1).join('\n\n') : '';
      }
      previewText = cleanBody ? `${mediaLabel}: ${cleanBody}` : mediaLabel;
    } else if (previewText.startsWith('> _"')) {
      // Strip markdown quote from text-only replies too
      const parts = previewText.split('\n\n');
      previewText = parts.length >= 2 ? parts.slice(1).join('\n\n') : previewText;
    }
    await ConversationModel.updateLastMessage(conversationId, {
      text: previewText,
      timestamp: now
    });

    // Auto-assign if unassigned
    if (!conversation.assigned_to) {
      await ConversationModel.update(conversationId, { assigned_to: staffId });
    }

    // Send via Twilio
    try {
      const twilioMsg = await TwilioService.sendWhatsAppMessage({
        to: conversation.phone_number,
        body,
        mediaUrl
      });

      // Update with Twilio SID and sent status
      const updatedMessage = await MessageModel.updateTwilioSid(messageId, twilioMsg.sid, 'sent');
      const updatedConversation = await ConversationModel.findById(conversationId);

      // Attach staff info for agent attribution
      const staff = await StaffModel.findById(staffId);
      const messageWithSender = {
        ...updatedMessage,
        sender_name: staff?.name || null,
        sender_email: staff?.email || null,
      };
      SocketService.emitNewMessage(messageWithSender, updatedConversation);

      return updatedMessage;
    } catch (error) {
      await MessageModel.updateStatus(messageId, 'failed');
      await MessageModel.createStatusLog({
        id: uuidv4(),
        message_id: messageId,
        status: 'failed',
        error_code: error.code?.toString(),
        error_message: error.message
      });

      const failedMessage = await MessageModel.findById(messageId);
      const failedConversation = await ConversationModel.findById(conversationId);
      SocketService.emitNewMessage(failedMessage, failedConversation);

      throw error;
    }
  },

  async handleIncomingMessage({ from, body, messageSid, mediaUrl, mediaContentType }) {
    const phoneNumber = from.replace('whatsapp:', '');

    // Find or create contact
    const contact = await ContactModel.findOrCreate(phoneNumber);

    // Find or create conversation
    let conversation = await ConversationModel.findByContactId(contact.id);
    if (!conversation) {
      conversation = await ConversationModel.create({
        id: uuidv4(),
        contact_id: contact.id
      });
    }

    const now = new Date().toISOString();

    // Store message
    const message = await MessageModel.create({
      id: uuidv4(),
      conversation_id: conversation.id,
      twilio_sid: messageSid,
      direction: 'inbound',
      sender_type: 'contact',
      sender_id: null,
      body,
      media_url: mediaUrl || null,
      media_content_type: mediaContentType || null,
      status: 'delivered'
    });

    // Update conversation — use descriptive text for media-only messages
    let previewText = body;
    if (!previewText && mediaContentType) {
      if (mediaContentType.startsWith('audio/')) previewText = '🎵 Voice message';
      else if (mediaContentType.startsWith('image/')) previewText = '📷 Photo';
      else if (mediaContentType.startsWith('video/')) previewText = '🎥 Video';
      else previewText = '📎 Document';
    }
    await ConversationModel.updateLastMessage(conversation.id, {
      text: previewText || '',
      timestamp: now
    });
    await ConversationModel.updateLastInbound(conversation.id, now);
    await ConversationModel.incrementUnread(conversation.id);

    const updatedConversation = await ConversationModel.findById(conversation.id);

    // Emit socket events
    SocketService.emitNewMessage(message, updatedConversation);
    SocketService.emitConversationUpdate(conversation.id, {
      lastMessage: previewText || '',
      unreadCount: updatedConversation.unread_count
    });

    // Send push notification
    PushService.sendNewMessageNotification(
      conversation.id,
      contact.display_name || contact.phone_number,
      body,
      mediaContentType
    );

    return { message, conversation: updatedConversation };
  },

  async handleStatusUpdate({ messageSid, status, errorCode, errorMessage }) {
    const message = await MessageModel.findByTwilioSid(messageSid);
    if (!message) return null;

    // Enforce status progression — never let a lower-priority status overwrite a higher one.
    // Terminal statuses (delivered, read, failed, undelivered) should not be overwritten by sent/queued.
    const STATUS_PRIORITY = { queued: 0, sent: 1, delivered: 2, read: 3, failed: 4, undelivered: 5 };
    const currentPriority = STATUS_PRIORITY[message.status] ?? -1;
    const newPriority = STATUS_PRIORITY[status] ?? -1;

    // Always log the webhook for auditing
    await MessageModel.createStatusLog({
      id: uuidv4(),
      message_id: message.id,
      status,
      error_code: errorCode,
      error_message: errorMessage
    });

    // Only update the message status if the new status is higher priority
    if (newPriority > currentPriority) {
      await MessageModel.updateStatus(message.id, status);
      SocketService.emitMessageStatus(message.id, status);
    }

    return MessageModel.findById(message.id);
  }
};

module.exports = MessageService;
