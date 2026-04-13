-- Add FCM token to staff for push notifications
ALTER TABLE staff ADD COLUMN IF NOT EXISTS fcm_token TEXT;

-- Add richer contact fields
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS company TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS tags TEXT[];
