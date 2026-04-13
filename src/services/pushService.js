const pool = require('../config/database');
const fs = require('fs');
const path = require('path');

let admin = null;

const PushService = {
  init() {
    // Try env var first, then file
    let serviceAccount = null;

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        console.log('Firebase: Loaded from env var, project:', serviceAccount.project_id);
      } catch (err) {
        console.error('Firebase: Failed to parse env var:', err.message);
      }
    }

    if (!serviceAccount) {
      const filePath = path.join(__dirname, '../../firebase-service-account.json');
      if (fs.existsSync(filePath)) {
        try {
          serviceAccount = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          console.log('Firebase: Loaded from file, project:', serviceAccount.project_id);
        } catch (err) {
          console.error('Firebase: Failed to parse file:', err.message);
        }
      }
    }

    if (serviceAccount) {
      try {
        const firebaseAdmin = require('firebase-admin');
        firebaseAdmin.initializeApp({
          credential: firebaseAdmin.credential.cert(serviceAccount)
        });
        admin = firebaseAdmin;
        console.log('Firebase Admin initialized successfully');
      } catch (err) {
        console.error('Firebase Admin init failed:', err.message);
      }
    } else {
      console.log('Push notifications disabled (no Firebase credentials found)');
    }
  },

  async sendNewMessageNotification(conversationId, contactName, messageBody, mediaContentType) {
    if (!admin) return;

    try {
      const result = await pool.query(
        'SELECT id, name, fcm_tokens FROM staff WHERE is_active = true AND (fcm_tokens IS NOT NULL AND array_length(fcm_tokens, 1) > 0)'
      );

      // Collect all tokens across all staff and all devices
      const tokens = result.rows.flatMap(r => (r.fcm_tokens || []).filter(Boolean));
      console.log(`Push: Found ${tokens.length} device tokens across ${result.rows.length} staff`);
      if (tokens.length === 0) {
        console.log('Push: No FCM tokens found, skipping');
        return;
      }

      let body = messageBody || '';
      if (!body && mediaContentType) {
        if (mediaContentType.startsWith('audio/')) body = '🎵 Voice message';
        else if (mediaContentType.startsWith('image/')) body = '📷 Photo';
        else if (mediaContentType.startsWith('video/')) body = '🎥 Video';
        else body = '📎 Document';
      }
      if (!body) body = 'New message received';

      console.log(`Push: Sending to ${tokens.length} devices — "${contactName}: ${body.substring(0, 30)}"`);

      const message = {
        data: {
          conversationId: String(conversationId),
          contactName: String(contactName || ''),
          messageBody: body.substring(0, 100),
          type: 'new_message',
        },
        android: {
          priority: 'high',
        },
        apns: {
          headers: {
            'apns-priority': '10',
          },
          payload: {
            aps: {
              alert: {
                title: String(contactName || 'New message'),
                body: body.substring(0, 100),
              },
              sound: 'default',
              badge: 1,
              'mutable-content': 1,
            },
          },
        },
        tokens: tokens,
      };

      const response = await admin.messaging().sendEachForMulticast(message);
      console.log(`Push: ${response.successCount} sent, ${response.failureCount} failed`);

      response.responses.forEach((resp, i) => {
        if (resp.error) {
          console.error(`Push failed for token ${tokens[i].substring(0, 20)}...: ${resp.error.code} - ${resp.error.message}`);
          if (
            resp.error.code === 'messaging/registration-token-not-registered' ||
            resp.error.code === 'messaging/invalid-registration-token'
          ) {
            pool.query('UPDATE staff SET fcm_tokens = array_remove(fcm_tokens, $1) WHERE $1 = ANY(fcm_tokens)', [tokens[i]]);
            console.log('Push: Removed invalid token');
          }
        }
      });
    } catch (err) {
      console.error('Push notification error:', err.message);
    }
  }
};

module.exports = PushService;
