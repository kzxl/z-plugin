/**
 * Cross-process leader lease for one workspace.
 *
 * Every IDE host starts an in-process observer against the same database. The
 * watcher and reconcile pass are only useful once per workspace, so they run
 * under a lease stored in observer_meta. The lease expires, so a crashed host
 * never wedges the workspace; the next host takes over on its next tick.
 */

import os from 'node:os';
import { getMeta, setMeta } from './db.mjs';

export const DEFAULT_LEASE_TTL_MS = Number(process.env.ZBRAIN_LEASE_TTL_MS) || 90000;

export function defaultOwner() {
  return `${os.hostname()}:${process.pid}`;
}

// A crashed host on the same machine is detected immediately instead of waiting
// for the TTL; remote hosts cannot be probed, so they expire normally.
function ownerIsLive(owner) {
  const [host, pidRaw] = String(owner || '').split(':');
  if (!host || host !== os.hostname()) return true;
  const pid = Number(pidRaw);
  if (!Number.isInteger(pid) || pid <= 0) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
}

export function leaseKeyFor(key) {
  return `lease:${key}`;
}

export function leaseStatus(db, key, { now = Date.now() } = {}) {
  const raw = getMeta(db, leaseKeyFor(key));
  if (!raw) return { owner: null, active: false, expiresAt: 0, acquiredAt: null };
  try {
    const data = JSON.parse(raw);
    const expiresAt = Number(data.expiresAt) || 0;
    const owner = data.owner || null;
    const active = Boolean(owner) && expiresAt > now && ownerIsLive(owner);
    return { owner, expiresAt, acquiredAt: data.acquiredAt || null, active };
  } catch {
    return { owner: null, active: false, expiresAt: 0, acquiredAt: null };
  }
}

export function acquireLease(db, key, { owner = defaultOwner(), ttlMs = DEFAULT_LEASE_TTL_MS, now = Date.now() } = {}) {
  const current = leaseStatus(db, key, { now });
  if (current.active && current.owner !== owner) {
    return { leader: false, owner: current.owner, expiresAt: current.expiresAt };
  }
  const renewed = current.owner === owner;
  const acquiredAt = renewed && current.acquiredAt ? current.acquiredAt : new Date(now).toISOString();
  const expiresAt = now + ttlMs;
  setMeta(db, leaseKeyFor(key), JSON.stringify({ owner, acquiredAt, expiresAt }));
  return { leader: true, owner, expiresAt, acquiredAt, renewed };
}

export function releaseLease(db, key, { owner = defaultOwner() } = {}) {
  const current = leaseStatus(db, key);
  if (current.owner && current.owner !== owner) return false;
  setMeta(db, leaseKeyFor(key), JSON.stringify({ owner: null, expiresAt: 0, releasedAt: new Date().toISOString() }));
  return true;
}
