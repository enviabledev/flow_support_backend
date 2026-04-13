const { v4: uuidv4 } = require('uuid');

// Test the status priority logic extracted from messageService.handleStatusUpdate
const STATUS_PRIORITY = { queued: 0, sent: 1, delivered: 2, read: 3, failed: 4, undelivered: 5 };

function shouldUpdateStatus(currentStatus, newStatus) {
  const currentPriority = STATUS_PRIORITY[currentStatus] ?? -1;
  const newPriority = STATUS_PRIORITY[newStatus] ?? -1;
  return newPriority > currentPriority;
}

describe('Status Priority Logic', () => {
  test('sent can overwrite queued', () => {
    expect(shouldUpdateStatus('queued', 'sent')).toBe(true);
  });

  test('delivered can overwrite sent', () => {
    expect(shouldUpdateStatus('sent', 'delivered')).toBe(true);
  });

  test('read can overwrite delivered', () => {
    expect(shouldUpdateStatus('delivered', 'read')).toBe(true);
  });

  test('undelivered can overwrite sent', () => {
    expect(shouldUpdateStatus('sent', 'undelivered')).toBe(true);
  });

  test('failed can overwrite sent', () => {
    expect(shouldUpdateStatus('sent', 'failed')).toBe(true);
  });

  // THE BUG FIX — this was the race condition
  test('sent CANNOT overwrite undelivered', () => {
    expect(shouldUpdateStatus('undelivered', 'sent')).toBe(false);
  });

  test('sent CANNOT overwrite delivered', () => {
    expect(shouldUpdateStatus('delivered', 'sent')).toBe(false);
  });

  test('sent CANNOT overwrite read', () => {
    expect(shouldUpdateStatus('read', 'sent')).toBe(false);
  });

  test('queued CANNOT overwrite sent', () => {
    expect(shouldUpdateStatus('sent', 'queued')).toBe(false);
  });

  test('delivered CANNOT overwrite read', () => {
    expect(shouldUpdateStatus('read', 'delivered')).toBe(false);
  });

  test('sent CANNOT overwrite failed', () => {
    expect(shouldUpdateStatus('failed', 'sent')).toBe(false);
  });

  test('unknown status has lowest priority', () => {
    expect(shouldUpdateStatus('queued', 'something_new')).toBe(false);
  });

  test('same status does not trigger update', () => {
    expect(shouldUpdateStatus('sent', 'sent')).toBe(false);
    expect(shouldUpdateStatus('delivered', 'delivered')).toBe(false);
  });
});
