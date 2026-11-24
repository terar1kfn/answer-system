import test from 'node:test';
import assert from 'node:assert/strict';
import {cases} from './cases.mjs';
for(const [name,run] of cases(assert))test(name,run);
