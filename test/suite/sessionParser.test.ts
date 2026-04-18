import * as assert from 'assert';
import * as path from 'path';
import { parseSessionMeta, parseFullMessages, clearCache } from '../../src/utils/sessionParser';

// __dirname is out/test/suite — navigate back to project root, then into test/fixtures
const FIXTURES = path.join(__dirname, '..', '..', '..', 'test', 'fixtures');

suite('SessionParser', () => {
  setup(() => clearCache());

  test('parses sample session metadata', async () => {
    const file = path.join(FIXTURES, 'sample-session.jsonl');
    const meta = await parseSessionMeta(file, '/home/user/project');

    assert.ok(meta, 'Should return metadata');
    assert.strictEqual(meta!.id, 'sample-session');
    assert.strictEqual(meta!.title, 'How do I reverse a string in Python?');
    assert.strictEqual(meta!.projectPath, '/home/user/project');
    assert.strictEqual(meta!.projectName, 'project');
    assert.ok(meta!.messageCount >= 4, 'Should count user+assistant messages');
    assert.ok(meta!.size > 0, 'Should report file size');
    assert.ok(meta!.toolsUsed.includes('Read'), 'Should detect tool use');
    assert.ok(meta!.filesModified.some(f => f.includes('test.py')), 'Should track files');
  });

  test('handles malformed lines gracefully', async () => {
    const file = path.join(FIXTURES, 'malformed-session.jsonl');
    const meta = await parseSessionMeta(file, '/home/user/project');

    assert.ok(meta, 'Should not return null for partially-valid file');
    assert.ok(meta!.messageCount >= 1, 'Should count valid messages only');
    assert.ok(meta!.title.length > 0, 'Should extract title from first valid message');
  });

  test('caches results on second call', async () => {
    const file = path.join(FIXTURES, 'sample-session.jsonl');
    const t0 = Date.now();
    await parseSessionMeta(file, '/home/user/project');
    const t1 = Date.now();
    await parseSessionMeta(file, '/home/user/project');
    const t2 = Date.now();

    // Second call should be dramatically faster (cache hit)
    assert.ok(t2 - t1 < t1 - t0 + 5, 'Second parse should be fast from cache');
  });

  test('parses full messages', async () => {
    const file = path.join(FIXTURES, 'sample-session.jsonl');
    const messages = await parseFullMessages(file);

    assert.ok(messages.length >= 2, 'Should return messages');
    const userMsgs = messages.filter(m => m.role === 'user');
    const asstMsgs = messages.filter(m => m.role === 'assistant');
    assert.ok(userMsgs.length >= 1, 'Should have user messages');
    assert.ok(asstMsgs.length >= 1, 'Should have assistant messages');

    const firstUser = userMsgs[0];
    assert.ok(firstUser.content.some(b => b.kind === 'text'), 'Should have text blocks');
  });

  test('handles tool_use blocks in messages', async () => {
    const file = path.join(FIXTURES, 'sample-session.jsonl');
    const messages = await parseFullMessages(file);
    const allBlocks = messages.flatMap(m => m.content);
    assert.ok(allBlocks.some(b => b.kind === 'tool_use'), 'Should parse tool_use blocks');
  });
});
