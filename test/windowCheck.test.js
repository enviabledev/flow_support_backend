// Test the 24-hour window expiry check logic used in messages.js and broadcast.js

function isWindowExpired(lastInbound) {
  return !lastInbound || (Date.now() - new Date(lastInbound).getTime()) >= 23 * 60 * 60 * 1000;
}

describe('24-Hour Window Check', () => {
  test('window expired when lastInbound is null', () => {
    expect(isWindowExpired(null)).toBe(true);
  });

  test('window expired when lastInbound is undefined', () => {
    expect(isWindowExpired(undefined)).toBe(true);
  });

  test('window expired when last inbound was 24 hours ago', () => {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    expect(isWindowExpired(twentyFourHoursAgo)).toBe(true);
  });

  test('window expired when last inbound was 23 hours ago', () => {
    const twentyThreeHoursAgo = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString();
    expect(isWindowExpired(twentyThreeHoursAgo)).toBe(true);
  });

  test('window expired when last inbound was 48 hours ago', () => {
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    expect(isWindowExpired(twoDaysAgo)).toBe(true);
  });

  test('window NOT expired when last inbound was 1 hour ago', () => {
    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    expect(isWindowExpired(oneHourAgo)).toBe(false);
  });

  test('window NOT expired when last inbound was 22 hours ago', () => {
    const twentyTwoHoursAgo = new Date(Date.now() - 22 * 60 * 60 * 1000).toISOString();
    expect(isWindowExpired(twentyTwoHoursAgo)).toBe(false);
  });

  test('window NOT expired when last inbound was just now', () => {
    const now = new Date().toISOString();
    expect(isWindowExpired(now)).toBe(false);
  });

  test('window NOT expired when last inbound was 5 minutes ago', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(isWindowExpired(fiveMinAgo)).toBe(false);
  });

  test('window expired when last inbound was 22 hours 59 minutes 59 seconds ago', () => {
    // Just under 23 hours — should NOT be expired
    const justUnder = new Date(Date.now() - (23 * 60 * 60 * 1000 - 1000)).toISOString();
    expect(isWindowExpired(justUnder)).toBe(false);
  });

  test('handles PostgreSQL timestamptz format', () => {
    const recentTimestamp = new Date(Date.now() - 60000).toISOString();
    expect(isWindowExpired(recentTimestamp)).toBe(false);
  });
});
