import test from 'node:test';
import assert from 'node:assert/strict';
import {cases} from './cases.mjs';
import {advancedCases} from './advanced-cases.mjs';
import {runtimeCases} from './runtime-cases.mjs';
import {serviceCases} from './service-cases.mjs';
for(const [name,run] of [...cases(assert),...advancedCases(assert),...runtimeCases(assert),...serviceCases(assert)])test(name,run);
