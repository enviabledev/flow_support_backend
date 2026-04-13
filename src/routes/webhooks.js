const express = require('express');
const MessageService = require('../services/messageService');
const { validateTwilioRequest } = require('../config/twilio');

const router = express.Router();

// Incoming WhatsApp message — respond IMMEDIATELY, process async
router.post('/twilio/incoming', validateTwilioRequest, (req, res) => {
  // Respond first so Twilio doesn't retry
  res.type('text/xml').send('<Response></Response>');

  // Process asynchronously
  const { From, Body, MessageSid, MediaUrl0, MediaContentType0, NumMedia } = req.body;
  console.log(`Incoming message from ${From}: ${Body}`);

  MessageService.handleIncomingMessage({
    from: From,
    body: Body,
    messageSid: MessageSid,
    mediaUrl: NumMedia > 0 ? MediaUrl0 : null,
    mediaContentType: NumMedia > 0 ? MediaContentType0 : null
  }).catch(err => console.error('Incoming webhook processing error:', err));
});

// Status updates — respond IMMEDIATELY, process async
router.post('/twilio/status', validateTwilioRequest, (req, res) => {
  res.sendStatus(200);

  const { MessageSid, MessageStatus, ErrorCode, ErrorMessage } = req.body;
  MessageService.handleStatusUpdate({
    messageSid: MessageSid,
    status: MessageStatus,
    errorCode: ErrorCode,
    errorMessage: ErrorMessage
  }).catch(err => console.error('Status webhook processing error:', err));
});

module.exports = router;
