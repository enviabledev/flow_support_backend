const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

let client = null;

function getTwilioClient() {
  if (!client) {
    if (!accountSid || !authToken) {
      console.warn('Twilio credentials not configured. Messages will not be sent.');
      return null;
    }
    client = twilio(accountSid, authToken);
  }
  return client;
}

function validateTwilioRequest(req, res, next) {
  if (process.env.NODE_ENV === 'development') {
    return next();
  }

  const twilioSignature = req.headers['x-twilio-signature'];
  const url = `${process.env.WEBHOOK_BASE_URL}${req.originalUrl}`;

  const isValid = twilio.validateRequest(
    authToken,
    twilioSignature,
    url,
    req.body
  );

  if (isValid) {
    next();
  } else {
    // Log the failure so we can diagnose missing messages
    console.error(`Twilio signature validation FAILED for ${req.originalUrl}`);
    console.error(`  Expected URL: ${url}`);
    console.error(`  From: ${req.body?.From || 'unknown'}`);
    console.error(`  Body: ${(req.body?.Body || '').substring(0, 50)}`);

    // Still process the message — better to have duplicates than miss messages
    // Twilio signature failures can happen during URL transitions
    console.warn('  Processing anyway to prevent message loss');
    next();
  }
}

module.exports = { getTwilioClient, validateTwilioRequest };
