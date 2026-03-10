import * as fs from 'fs';
import * as path from 'path';
import { TransferInFact, DisplayStatus } from './types';
import { classifyBatch } from './engine';

/**
 * Minimal CSV parser (no dependencies).
 */
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map((line) => {
    const values = line.split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = values[i] ?? '';
    });
    return row;
  });
}

function toBool(val: string | undefined): boolean {
  if (!val) return false;
  return val === 'true' || val === '1' || val === 't';
}

function toNullableString(val: string | undefined): string | null {
  if (!val || val === '' || val === 'NULL' || val === 'null') return null;
  return val;
}

function toNullableNumber(val: string | undefined): number | null {
  if (!val || val === '' || val === 'NULL' || val === 'null') return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

function toNullableBool(val: string | undefined): boolean | null {
  if (!val || val === '' || val === 'NULL' || val === 'null') return null;
  return val === 'true' || val === '1' || val === 't';
}

function csvRowToFact(row: Record<string, string>): TransferInFact {
  return {
    id: Number(row['id'] ?? 0),
    status: toNullableString(row['status']),
    trackerStatus: toNullableString(row['trackerStatus']),
    cancellationRequested: toBool(row['cancellationRequested']),
    closed: toBool(row['closed']),
    reference: toNullableString(row['reference']),
    transferAllFound: toNullableBool(row['transferAllFound']),
    estimatedTransferValue: toNullableNumber(row['estimatedTransferValue']),
    cedingProviderId: toNullableString(row['cedingProviderId']),
    cedingProviderName: toNullableString(row['cedingProviderName']),
    cedingAccountReference: toNullableString(row['cedingAccountReference']),
    employerName: toNullableString(row['employerName']),
    hasAddress: toNullableString(row['hasAddress']),
    pollId: toNullableNumber(row['pollId']),
    pollCompletedAt: toNullableString(row['pollCompletedAt']),
    type: row['type'] ?? 'pension',
    transferMethod: row['transferMethod'] ?? 'full',
    transferProportion: row['transferProportion'] ?? 'full',
    contribution: toNullableNumber(row['contribution']),
  };
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.log('Usage: npm run test-csv -- <path-to-csv>');
    console.log('  e.g. npm run test-csv -- ./data/transfers.csv');
    process.exit(1);
  }

  const resolved = path.resolve(csvPath);
  if (!fs.existsSync(resolved)) {
    console.error(`File not found: ${resolved}`);
    process.exit(1);
  }

  const text = fs.readFileSync(resolved, 'utf-8');
  const rows = parseCSV(text);
  console.log(`Loaded ${rows.length} rows from CSV\n`);

  const facts = rows.map(csvRowToFact);
  const results = await classifyBatch(facts);

  // Summary
  const summary = new Map<string, number>();
  for (const r of results) {
    summary.set(r.displayStatus, (summary.get(r.displayStatus) ?? 0) + 1);
  }

  console.log('--- Classification Summary ---');
  for (const [status, count] of [...summary.entries()].sort(
    (a, b) => b[1] - a[1]
  )) {
    const pct = ((count / results.length) * 100).toFixed(1);
    console.log(`  ${status.padEnd(20)} ${String(count).padStart(5)} (${pct}%)`);
  }

  // Show unclassified
  const unclassified = results.filter((r) => r.displayStatus === 'UNCLASSIFIED');
  if (unclassified.length > 0) {
    console.log(`\n--- Unclassified Transfers (${unclassified.length}) ---`);
    for (const u of unclassified.slice(0, 10)) {
      const fact = facts.find((f) => f.id === u.transferId);
      console.log(`  ID ${u.transferId}: ${JSON.stringify(fact)}`);
    }
    if (unclassified.length > 10) {
      console.log(`  ... and ${unclassified.length - 10} more`);
    }
  }

  // Show multi-match conflicts
  const conflicts = results.filter((r) => r.allMatches.length > 1);
  if (conflicts.length > 0) {
    const withDiffStatuses = conflicts.filter((r) => {
      const statuses = new Set(r.allMatches.map((m) => m.status));
      return statuses.size > 1;
    });
    if (withDiffStatuses.length > 0) {
      console.log(
        `\n--- Transfers with Conflicting Rule Matches (${withDiffStatuses.length}) ---`
      );
      for (const c of withDiffStatuses.slice(0, 10)) {
        console.log(
          `  ID ${c.transferId}: Winner=${c.displayStatus} | All: ${c.allMatches.map((m) => `${m.status}(${m.rule})`).join(', ')}`
        );
      }
    }
  }
}

main().catch(console.error);
