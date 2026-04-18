import * as assert from 'assert';
import * as path from 'path';
import { fastSearch, fullTextMatch, searchSessions } from '../../src/utils/search';
import { SessionMeta } from '../../src/types';

// __dirname is out/test/suite — navigate back to project root, then into test/fixtures
const FIXTURES = path.join(__dirname, '..', '..', '..', 'test', 'fixtures');

function makeMeta(overrides: Partial<SessionMeta> = {}): SessionMeta {
  return {
    id: 'test-id',
    filePath: path.join(FIXTURES, 'sample-session.jsonl'),
    projectPath: '/home/user/myproject',
    projectName: 'myproject',
    title: 'How do I reverse a string in Python?',
    preview: 'How do I reverse a string in Python?',
    messageCount: 4,
    mtime: Date.now(),
    size: 1024,
    toolsUsed: [],
    filesModified: [],
    ...overrides,
  };
}

suite('Search', () => {
  test('fastSearch matches by title', () => {
    const sessions = [
      makeMeta(),
      makeMeta({ id: 'other', title: 'Build a web server', preview: 'Build a web server' }),
    ];
    const results = fastSearch(sessions, 'reverse');
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].title, 'How do I reverse a string in Python?');
  });

  test('fastSearch is case-insensitive', () => {
    const sessions = [makeMeta()];
    assert.strictEqual(fastSearch(sessions, 'PYTHON').length, 1);
    assert.strictEqual(fastSearch(sessions, 'python').length, 1);
  });

  test('fastSearch matches by project name', () => {
    const sessions = [makeMeta(), makeMeta({ id: 'other', projectName: 'stellarhack' })];
    const results = fastSearch(sessions, 'stellar');
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].projectName, 'stellarhack');
  });

  test('fastSearch returns empty for no match', () => {
    const sessions = [makeMeta()];
    assert.strictEqual(fastSearch(sessions, 'xyzzy_no_match').length, 0);
  });

  test('fullTextMatch finds content in file', async () => {
    const file = path.join(FIXTURES, 'sample-session.jsonl');
    assert.ok(await fullTextMatch(file, 'reverse'), 'Should find "reverse" in file');
    assert.ok(!(await fullTextMatch(file, 'xyzzy_guaranteed_not_present')), 'Should not find garbage');
  });

  test('searchSessions returns all sessions for empty query', async () => {
    const sessions = [makeMeta(), makeMeta({ id: 'other', title: 'Other session' })];
    const results = await searchSessions(sessions, '');
    assert.strictEqual(results.length, 2);
  });

  test('searchSessions does full-text search for non-title matches', async () => {
    // "olleh" appears in the file content (in code example) but not in title/preview
    const session = makeMeta({ title: 'Different title', preview: 'Different preview' });
    const results = await searchSessions([session], 'olleh');
    assert.strictEqual(results.length, 1);
  });
});
