import * as assert from 'assert';
import { decodeProjectPath, projectDisplayName } from '../../src/utils/claudeDir';

suite('ClaudeDir', () => {
  suite('decodeProjectPath', () => {
    test('decodes Windows paths', () => {
      assert.strictEqual(
        decodeProjectPath('c--Users-ritik-Desktop-stellarhack'),
        'C:/Users/ritik/Desktop/stellarhack'
      );
    });

    test('decodes Windows paths with uppercase drive', () => {
      assert.strictEqual(
        decodeProjectPath('C--Users-ritik-Desktop-myproject'),
        'C:/Users/ritik/Desktop/myproject'
      );
    });

    test('decodes Linux absolute paths', () => {
      assert.strictEqual(
        decodeProjectPath('-home-ritik-projects-lodestar'),
        '/home/ritik/projects/lodestar'
      );
    });

    test('decodes macOS paths', () => {
      assert.strictEqual(
        decodeProjectPath('-Users-alice-code-myapp'),
        '/Users/alice/code/myapp'
      );
    });

    test('handles paths with numbers and dashes in folder names', () => {
      const result = decodeProjectPath('c--Users-ritik-Desktop-New-folder--2-');
      assert.ok(result.startsWith('C:/'), 'Should start with drive letter');
    });
  });

  suite('projectDisplayName', () => {
    test('returns last segment of Windows path', () => {
      assert.strictEqual(projectDisplayName('C:/Users/ritik/Desktop/stellarhack'), 'stellarhack');
    });

    test('returns last segment of Linux path', () => {
      assert.strictEqual(projectDisplayName('/home/ritik/projects/lodestar'), 'lodestar');
    });

    test('handles trailing slash', () => {
      assert.strictEqual(projectDisplayName('/home/user/myproject/'), 'myproject');
    });
  });
});
