// Test broadcast response structure and skip logic

describe('Broadcast Response Structure', () => {
  function buildBroadcastResponse(conversations) {
    const results = { sent: [], skipped: [], failed: [] };

    for (const conv of conversations) {
      if (!conv.found) {
        results.failed.push({ conversationId: conv.id, error: 'Conversation not found' });
        continue;
      }

      const windowExpired = !conv.lastInbound ||
        (Date.now() - new Date(conv.lastInbound).getTime()) >= 23 * 60 * 60 * 1000;

      if (windowExpired) {
        results.skipped.push({
          conversationId: conv.id,
          contactName: conv.contactName,
          reason: '24h window expired',
        });
        continue;
      }

      results.sent.push({
        conversationId: conv.id,
        contactName: conv.contactName,
        messageId: 'msg_' + conv.id,
      });
    }

    return {
      total: conversations.length,
      sent: results.sent.length,
      skipped: results.skipped.length,
      failed: results.failed.length,
      results,
    };
  }

  test('all sent when all windows open', () => {
    const convs = [
      { id: '1', found: true, contactName: 'Alice', lastInbound: new Date().toISOString() },
      { id: '2', found: true, contactName: 'Bob', lastInbound: new Date().toISOString() },
    ];
    const res = buildBroadcastResponse(convs);
    expect(res.total).toBe(2);
    expect(res.sent).toBe(2);
    expect(res.skipped).toBe(0);
    expect(res.failed).toBe(0);
    expect(res.results.sent).toHaveLength(2);
  });

  test('all skipped when all windows expired', () => {
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const convs = [
      { id: '1', found: true, contactName: 'Alice', lastInbound: old },
      { id: '2', found: true, contactName: 'Bob', lastInbound: null },
    ];
    const res = buildBroadcastResponse(convs);
    expect(res.total).toBe(2);
    expect(res.sent).toBe(0);
    expect(res.skipped).toBe(2);
    expect(res.failed).toBe(0);
    expect(res.results.skipped[0].reason).toBe('24h window expired');
    expect(res.results.skipped[1].reason).toBe('24h window expired');
  });

  test('mixed: some sent, some skipped, some failed', () => {
    const recent = new Date().toISOString();
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const convs = [
      { id: '1', found: true, contactName: 'Alice', lastInbound: recent },
      { id: '2', found: true, contactName: 'Bob', lastInbound: old },
      { id: '3', found: false, contactName: 'Charlie', lastInbound: recent },
    ];
    const res = buildBroadcastResponse(convs);
    expect(res.total).toBe(3);
    expect(res.sent).toBe(1);
    expect(res.skipped).toBe(1);
    expect(res.failed).toBe(1);
    expect(res.results.sent[0].contactName).toBe('Alice');
    expect(res.results.skipped[0].contactName).toBe('Bob');
  });

  test('skipped entry has correct structure', () => {
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const convs = [
      { id: 'conv-123', found: true, contactName: 'Test User', lastInbound: old },
    ];
    const res = buildBroadcastResponse(convs);
    const skipped = res.results.skipped[0];
    expect(skipped).toHaveProperty('conversationId', 'conv-123');
    expect(skipped).toHaveProperty('contactName', 'Test User');
    expect(skipped).toHaveProperty('reason', '24h window expired');
  });

  test('null lastInbound treated as expired', () => {
    const convs = [
      { id: '1', found: true, contactName: 'New Contact', lastInbound: null },
    ];
    const res = buildBroadcastResponse(convs);
    expect(res.skipped).toBe(1);
    expect(res.sent).toBe(0);
  });
});
