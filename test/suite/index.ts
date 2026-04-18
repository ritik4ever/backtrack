// Simple test runner — no external test framework needed.
// Declares suite/test/setup as globals so test files can use them without imports.

type TestFn = () => void | Promise<void>;
interface TestSuite { name: string; tests: Array<{ name: string; fn: TestFn }>; setup?: TestFn }

const suites: TestSuite[] = [];
let currentSuite: TestSuite | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).suite = function (name: string, fn: () => void) {
  const s: TestSuite = { name, tests: [] };
  suites.push(s);
  currentSuite = s;
  fn();
  currentSuite = null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).test = function (name: string, fn: TestFn) {
  if (!currentSuite) throw new Error('test() called outside suite()');
  currentSuite.tests.push({ name, fn });
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).setup = function (fn: TestFn) {
  if (!currentSuite) throw new Error('setup() called outside suite()');
  currentSuite.setup = fn;
};

require('./sessionParser.test');
require('./claudeDir.test');
require('./search.test');
require('./exporter.test');

async function run() {
  let passed = 0;
  let failed = 0;

  for (const s of suites) {
    console.log(`\n  ${s.name}`);
    for (const t of s.tests) {
      try {
        if (s.setup) await s.setup();
        await t.fn();
        console.log(`    ✓ ${t.name}`);
        passed++;
      } catch (err) {
        console.error(`    ✗ ${t.name}`);
        console.error(`      ${err}`);
        failed++;
      }
    }
  }

  console.log(`\n  ${passed} passing, ${failed} failing\n`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
