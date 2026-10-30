#!/usr/bin/env node
// Usage: coverage-delta.mjs <before coverage-summary.json> <after coverage-summary.json>
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const METRICS = ['lines', 'branches', 'functions', 'statements'];

export function coverageDelta(before, after) {
  const delta = {};
  for (const metric of METRICS) {
    const from = before?.total?.[metric]?.pct ?? null;
    const to = after?.total?.[metric]?.pct ?? null;
    delta[metric] = { before: from, after: to, change: from === null || to === null ? null : Number((to - from).toFixed(2)) };
  }
  return delta;
}

function load(path) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(JSON.stringify(coverageDelta(load(process.argv[2]), load(process.argv[3])), null, 2));
}
