import { test } from 'node:test';
import { apiContract } from './api-contract.mjs';
import { workerFixture, seed } from './helpers.mjs';

apiContract(test, async t => { const f = await workerFixture(t); await seed(f.db); return f; });
