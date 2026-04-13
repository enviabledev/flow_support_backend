# Flow Support Backend

## Overview
Node.js/Express backend for WhatsApp Business messaging via Twilio. Manages conversations, messages, staff, and contacts for Enviable Investment's customer support operation.

## Architecture
- **Runtime**: Node.js with Express
- **Database**: PostgreSQL (via `pg` pool)
- **Real-time**: Socket.IO for pushing message events to connected clients
- **WhatsApp**: Twilio WhatsApp Business API
- **Push**: Firebase Cloud Messaging (FCM) for mobile push notifications
- **Auth**: JWT tokens with bcrypt password hashing
- **File storage**: Local disk (`/app/uploads` in Docker), served via static route
- **Deployment**: Docker Compose on AWS EC2

## Key Patterns

### 24h Window Enforcement
- `routes/messages.js`: POST `/:conversationId/messages` checks `MAX(created_at)` of inbound messages. If null or >= 23 hours, returns `400 { error: "24h window expired", windowExpired: true }`. Message never reaches Twilio.
- `routes/broadcast.js`: Same check per conversation. Expired contacts go into `results.skipped[]` with `reason: "24h window expired"`. Response includes `skipped` count.
- Logging: `console.log('24h window BLOCKED: ...')` or `'24h window OK: ...'` for debugging.

### Status Priority (Atomic)
- Twilio sends webhooks (`sent`, `delivered`, `read`, `undelivered`, `failed`) that can arrive out of order or simultaneously.
- `models/messages.js` `updateStatus()` uses SQL WHERE clause with CASE-based priority: `queued(0) < sent(1) < delivered(2) < read(3) < failed(4) < undelivered(5)`. Lower priority statuses cannot overwrite higher ones at the database level — fully atomic, no race conditions.
- `services/messageService.js` `handleStatusUpdate()` also has JS-level priority check as defense in depth. Always logs the webhook regardless of whether the status is updated.
- Status constraint: `CHECK(status IN ('queued', 'sent', 'delivered', 'read', 'failed', 'undelivered'))`

### Conversation Queries
- `models/conversations.js` `findAll()` and `routes/conversations.js` sync endpoint both JOIN the last message to get `last_message_direction`, `last_message_status`, and `last_message_sender_name`.

### Broadcast
- `routes/broadcast.js`: Iterates conversationIds, checks 24h window, sends via Twilio, stores in DB, emits socket events. 200ms delay between sends for rate limiting. Returns `{ total, sent, skipped, failed, results: { sent: [], skipped: [], failed: [] } }`.

## Project Structure
```
src/
  config/
    database.js      — PostgreSQL pool
    initDb.js        — DB initialization
    migrate.js       — Migration runner
    twilio.js        — Twilio client + signature validation middleware
  middleware/
    auth.js          — JWT authentication
  models/
    contacts.js      — Contact CRUD
    conversations.js — Conversation queries (findAll, findById, etc.)
    messages.js      — Message CRUD + atomic status update
    staff.js         — Staff management
  routes/
    auth.js          — Login, register FCM token
    broadcast.js     — Broadcast with 24h window skip
    contacts.js      — Contact endpoints
    conversations.js — Conversation list, sync, star/unstar
    messages.js      — Send message (with 24h check), list, search
    staff.js         — Staff CRUD (admin only)
    upload.js        — File upload (16MB limit, multer)
    webhooks.js      — Twilio incoming + status webhooks
  services/
    messageService.js — Send message, handle incoming, handle status update
    pushService.js    — Firebase Cloud Messaging
    socketService.js  — Socket.IO event emission
    twilioService.js  — Twilio WhatsApp send
  index.js           — Express app setup, middleware, routes
migrations/
  001_initial.sql    — Core schema (contacts, conversations, messages, staff)
  002_enhancements.sql
  003_replies.sql
  004_starred_conversations.sql
  005_multi_device_tokens.sql
test/
  statusPriority.test.js  — Status priority logic (13 tests)
  windowCheck.test.js     — 24h window expiry logic (11 tests)
  broadcastSkip.test.js   — Broadcast skip/sent/failed structure (5 tests)
```

## Server
- AWS EC2 instance running Docker Compose
- SSH key at `~/.ssh/enviable-key.pem`
- Docker Compose at `~/enviable-whatsapp/` on server
- Restart API: `docker-compose restart api`
- View logs: `docker-compose logs --tail=50 api`
- DB shell: `docker-compose exec -T db psql -U <user> -d <db>` (credentials in docker-compose.yml on server)
- Deploy a file: `scp -i ~/.ssh/enviable-key.pem <local_path> ec2-user@<server_ip>:~/enviable-whatsapp/backend/<remote_path>` then restart
- Server IP and credentials are in Terraform outputs / .env (not committed)

## Database
- PostgreSQL, credentials in docker-compose.yml on server (not committed)
- Messages status CHECK: `queued, sent, delivered, read, failed, undelivered`
- `last_inbound_at` column on conversations tracks 24h window
- `message_status_log` table logs every Twilio webhook for auditing

## Environment
- `.env` file (gitignored) contains: `DATABASE_URL`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`, `JWT_SECRET`, `WEBHOOK_BASE_URL`, `FIREBASE_SERVICE_ACCOUNT`
- Firebase service account JSON loaded from env var or file at `firebase-service-account.json`

## Testing
- `npm test` (jest) — 29 tests
- Status priority: 13 tests
- Window check: 11 tests
- Broadcast skip: 5 tests

## Git
- Repo: https://github.com/enviabledev/flow_support_backend.git
- `.env` and `firebase-service-account.json` are gitignored

## Twilio Webhooks
- Incoming: `POST /webhooks/twilio/incoming` — receives messages from WhatsApp
- Status: `POST /webhooks/twilio/status` — receives delivery status updates
- Configure in Twilio console with `<server_url>/webhooks/twilio/incoming` and `<server_url>/webhooks/twilio/status`
