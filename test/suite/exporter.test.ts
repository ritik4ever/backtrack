import * as assert from 'assert';
import { exportToMarkdown, suggestedFilename } from '../../src/utils/exporter';
import { ParsedMessage, SessionMeta } from '../../src/types';

function makeMeta(overrides: Partial<SessionMeta> = {}): SessionMeta {
  return {
    id: 'abc12345-def6-7890-abcd-ef1234567890',
    filePath: '/tmp/test.jsonl',
    projectPath: '/home/user/myproject',
    projectName: 'myproject',
    title: 'Test session title',
    preview: 'Test preview',
    messageCount: 2,
    mtime: new Date('2026-04-07T12:00:00Z').getTime(),
    size: 1024,
    toolsUsed: [],
    filesModified: [],
    ...overrides,
  };
}

const MESSAGES: ParsedMessage[] = [
  { role: 'user', content: [{ kind: 'text', text: 'Hello, Claude!' }] },
  { role: 'assistant', content: [{ kind: 'text', text: 'Hello! How can I help?' }] },
];

suite('Exporter', () => {
  test('exportToMarkdown includes title', () => {
    const md = exportToMarkdown(makeMeta(), MESSAGES);
    assert.ok(md.includes('Test session title'), 'Should include session title');
  });

  test('exportToMarkdown includes project path', () => {
    const md = exportToMarkdown(makeMeta(), MESSAGES);
    assert.ok(md.includes('/home/user/myproject'), 'Should include project path');
  });

  test('exportToMarkdown includes session ID', () => {
    const md = exportToMarkdown(makeMeta(), MESSAGES);
    assert.ok(md.includes('abc12345-def6-7890-abcd-ef1234567890'), 'Should include session ID');
  });

  test('exportToMarkdown includes message content', () => {
    const md = exportToMarkdown(makeMeta(), MESSAGES);
    assert.ok(md.includes('Hello, Claude!'), 'Should include user message');
    assert.ok(md.includes('Hello! How can I help?'), 'Should include assistant message');
  });

  test('exportToMarkdown handles tool_use blocks', () => {
    const msgs: ParsedMessage[] = [
      {
        role: 'assistant',
        content: [
          { kind: 'tool_use', name: 'Read', inputSummary: '{"path":"/tmp/file.txt"}' },
          { kind: 'tool_result', outputSummary: 'file contents here' },
        ],
      },
    ];
    const md = exportToMarkdown(makeMeta(), msgs);
    assert.ok(md.includes('Read'), 'Should include tool name');
    assert.ok(md.includes('file contents here'), 'Should include tool result');
  });

  test('suggestedFilename uses project name and short ID', () => {
    const name = suggestedFilename(makeMeta());
    assert.ok(name.startsWith('myproject-'), 'Should start with project name');
    assert.ok(name.includes('abc12345'), 'Should include first 8 chars of session ID');
    assert.ok(name.endsWith('.md'), 'Should end with .md');
  });

  test('suggestedFilename sanitizes special chars in project name', () => {
    const name = suggestedFilename(makeMeta({ projectName: 'my project (v2)' }));
    assert.ok(!/[() ]/.test(name), 'Should not contain spaces or parens');
  });
});
