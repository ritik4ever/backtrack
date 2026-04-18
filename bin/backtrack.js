#!/usr/bin/env node
'use strict';

// Resolve the compiled CLI entry point relative to this script.
// After `npm run compile`, it lands at out/src/cli/index.js
const path = require('path');
require(path.join(__dirname, '..', 'out', 'src', 'cli', 'index.js'));
