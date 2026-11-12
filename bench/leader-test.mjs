// Cross-process leader lease used to serialize the workspace observer.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zbrain-leader-'));
process.env.ZBRAIN_DB_PATH = path.join(tempDir, 'data', 'brain.sqlite');

const { getDb, closeDb } = await import('../plugins/z-brain/scripts/lib/db.mjs');
const { acquireLease, leaseStatus, releaseLease } = await import('../plugins/z-brain/scripts/lib/leader.mjs');

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed++;
  console.log('  ok  ', msg);
}

const db = getDb();
const KEY = 'observer:test-workspace';
const T0 = 1_000_000;

console.log('z-brain leader: acquisition');
let first = acquireLease(db, KEY, { owner: 'host-a:1', ttlMs: 90000, now: T0 });
ok(first.leader === true, 'first owner acquires the lease');
ok(first.renewed === false, 'first acquisition is not a renewal');
ok(first.expiresAt === T0 + 90000, 'lease expiry follows the ttl');

const status = leaseStatus(db, KEY, { now: T0 + 1000 });
ok(status.owner === 'host-a:1' && status.active, 'lease status reports the active owner');

console.log('z-brain leader: contention');
const blocked = acquireLease(db, KEY, { owner: 'host-b:2', ttlMs: 90000, now: T0 + 1000 });
ok(blocked.leader === false, 'another live owner cannot take the lease');
ok(blocked.owner === 'host-a:1', 'blocked caller sees the current owner');

const renew = acquireLease(db, KEY, { owner: 'host-a:1', ttlMs: 90000, now: T0 + 30000 });
ok(renew.leader === true && renew.renewed === true, 'owner renews its own lease');
ok(renew.expiresAt === T0 + 120000, 'renewal extends the expiry');
ok(renew.acquiredAt === first.acquiredAt, 'renewal keeps the original acquisition time');

console.log('z-brain leader: takeover and release');
const takeover = acquireLease(db, KEY, { owner: 'host-b:2', ttlMs: 90000, now: T0 + 130000 });
ok(takeover.leader === true, 'an expired lease is taken over');
ok(takeover.owner === 'host-b:2', 'takeover records the new owner');

ok(releaseLease(db, KEY, { owner: 'host-a:1' }) === false, 'a stale owner cannot release the lease');
ok(releaseLease(db, KEY, { owner: 'host-b:2' }) === true, 'the active owner can release the lease');
ok(leaseStatus(db, KEY, { now: T0 + 140000 }).active === false, 'released lease is inactive');

const afterRelease = acquireLease(db, KEY, { owner: 'host-c:3', ttlMs: 90000, now: T0 + 140000 });
ok(afterRelease.leader === true, 'a released lease is immediately available');

console.log('z-brain leader: crashed local host');
const deadKey = 'observer:dead-host';
acquireLease(db, deadKey, { owner: `${os.hostname()}:999999`, ttlMs: 90000, now: T0 });
const takeoverAfterCrash = acquireLease(db, deadKey, { owner: 'host-c:3', ttlMs: 90000, now: T0 + 1000 });
ok(takeoverAfterCrash.leader === true, 'a dead local owner is replaced before the ttl expires');

closeDb();
fs.rmSync(tempDir, { recursive: true, force: true });
console.log(`\nz-brain leader lease: ${passed} assertions passed`);
