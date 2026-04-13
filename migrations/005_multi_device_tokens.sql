-- Support multiple FCM tokens per staff (multi-device)
ALTER TABLE staff ADD COLUMN IF NOT EXISTS fcm_tokens TEXT[] DEFAULT '{}';

-- Migrate existing single token to array
UPDATE staff SET fcm_tokens = ARRAY[fcm_token] WHERE fcm_token IS NOT NULL AND fcm_token != '' AND (fcm_tokens IS NULL OR fcm_tokens = '{}');
