const { getTwilioClient } = require('../config/twilio');

const TwilioService = {
  async sendWhatsAppMessage({ to, body, mediaUrl }) {
    const client = getTwilioClient();
    if (!client) {
      throw new Error('Twilio client not configured');
    }

    const messageParams = {
      from: process.env.TWILIO_WHATSAPP_NUMBER,
      to: `whatsapp:${to}`,
      statusCallback: `${process.env.WEBHOOK_BASE_URL}/webhooks/twilio/status`
    };

    // Twilio requires body or mediaUrl — but body can be empty string if media is present
    if (body) {
      messageParams.body = body;
    }

    if (mediaUrl) {
      messageParams.mediaUrl = [mediaUrl];
      // If no body text, Twilio still needs the body field (can be empty string)
      if (!messageParams.body) {
        messageParams.body = '';
      }
    }

    if (!messageParams.body && !messageParams.mediaUrl) {
      throw new Error('Message must have body or media');
    }

    const twilioMessage = await client.messages.create(messageParams);
    return twilioMessage;
  }
};

module.exports = TwilioService;
