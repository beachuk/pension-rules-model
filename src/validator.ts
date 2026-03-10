import {
  RuleDefinition,
  RuleCondition,
  TransferInFact,
  DISPLAY_STATUSES,
  DisplayStatus,
} from './types';
import { transferInRules } from './rules';
import { buildEngine } from './engine';

interface ValidationIssue {
  type: 'conflict' | 'blind_spot' | 'warning';
  message: string;
  rules?: string[];
}

/**
 * Extract all facts and their possible values referenced across all rules.
 */
function extractFactSpace(rules: RuleDefinition[]): Map<string, Set<unknown>> {
  const factValues = new Map<string, Set<unknown>>();

  function walkCondition(cond: RuleCondition) {
    if (cond.fact) {
      if (!factValues.has(cond.fact)) {
        factValues.set(cond.fact, new Set());
      }
      factValues.get(cond.fact)!.add(cond.value);
    }
    if (cond.all) cond.all.forEach(walkCondition);
    if (cond.any) cond.any.forEach(walkCondition);
  }

  for (const rule of rules) {
    if (rule.conditions.all) rule.conditions.all.forEach(walkCondition);
    if (rule.conditions.any) rule.conditions.any.forEach(walkCondition);
  }

  return factValues;
}

/**
 * Generate synthetic test cases covering the combinatorial space of fact values.
 */
function generateTestCases(
  factSpace: Map<string, Set<unknown>>
): Partial<TransferInFact>[] {
  const facts = Array.from(factSpace.entries());
  const cases: Partial<TransferInFact>[] = [];

  // Generate all combinations of observed fact values
  function generate(
    index: number,
    current: Partial<TransferInFact>
  ) {
    if (index === facts.length) {
      cases.push({ ...current, id: cases.length + 1 });
      return;
    }

    const [factName, values] = facts[index];
    for (const value of values) {
      (current as any)[factName] = value;
      generate(index + 1, current);
    }
  }

  generate(0, {});
  return cases;
}

/**
 * Validate the rule set for conflicts and blind spots.
 */
export async function validateRules(
  rules: RuleDefinition[] = transferInRules
): Promise<{
  issues: ValidationIssue[];
  coverage: Map<DisplayStatus | 'UNCLASSIFIED', number>;
  totalTestCases: number;
  testResults: {
    fact: Partial<TransferInFact>;
    matches: { status: string; rule: string; priority: number }[];
  }[];
}> {
  const issues: ValidationIssue[] = [];
  const coverage = new Map<DisplayStatus | 'UNCLASSIFIED', number>();
  const testResults: {
    fact: Partial<TransferInFact>;
    matches: { status: string; rule: string; priority: number }[];
  }[] = [];

  // Initialize coverage counters
  for (const status of DISPLAY_STATUSES) {
    coverage.set(status, 0);
  }
  coverage.set('UNCLASSIFIED', 0);

  // Check for duplicate rule names
  const nameCount = new Map<string, number>();
  for (const rule of rules) {
    nameCount.set(rule.name, (nameCount.get(rule.name) ?? 0) + 1);
  }
  for (const [name, count] of nameCount) {
    if (count > 1) {
      issues.push({
        type: 'warning',
        message: `Duplicate rule name: "${name}" appears ${count} times`,
        rules: [name],
      });
    }
  }

  // Check for statuses with no rules
  const coveredStatuses = new Set(rules.map((r) => r.displayStatus));
  for (const status of DISPLAY_STATUSES) {
    if (!coveredStatuses.has(status)) {
      issues.push({
        type: 'blind_spot',
        message: `No rule maps to display status "${status}"`,
      });
    }
  }

  // Generate synthetic test cases and run through engine
  const factSpace = extractFactSpace(rules);
  const testCases = generateTestCases(factSpace);
  const engine = buildEngine(rules);

  for (const testCase of testCases) {
    // Fill in defaults for missing fields
    const fullFact: TransferInFact = {
      id: testCase.id ?? 0,
      status: testCase.status ?? null,
      trackerStatus: testCase.trackerStatus ?? null,
      cancellationRequested: testCase.cancellationRequested ?? false,
      closed: testCase.closed ?? false,
      reference: testCase.reference ?? null,
      transferAllFound: testCase.transferAllFound ?? null,
      estimatedTransferValue: testCase.estimatedTransferValue ?? null,
      cedingProviderId: testCase.cedingProviderId ?? null,
      cedingProviderName: testCase.cedingProviderName ?? null,
      cedingAccountReference: testCase.cedingAccountReference ?? null,
      employerName: testCase.employerName ?? null,
      hasIncompleteActions: testCase.hasIncompleteActions ?? false,
      hasAddress: testCase.hasAddress ?? null,
      pollId: testCase.pollId ?? null,
      pollCompletedAt: testCase.pollCompletedAt ?? null,
      type: testCase.type ?? 'pension',
      transferMethod: testCase.transferMethod ?? 'full',
      transferProportion: testCase.transferProportion ?? 'full',
      contribution: testCase.contribution ?? null,
    };

    const result = await engine.run(fullFact);

    const matches = result.events
      .map((event) => {
        const ruleDef = rules.find(
          (r) => r.name === event.params?.ruleName
        );
        return {
          status: event.type,
          rule: event.params?.ruleName as string,
          priority: ruleDef?.priority ?? 0,
        };
      })
      .sort((a, b) => b.priority - a.priority);

    testResults.push({ fact: testCase, matches });

    if (matches.length === 0) {
      coverage.set('UNCLASSIFIED', (coverage.get('UNCLASSIFIED') ?? 0) + 1);
    } else {
      const winner = matches[0].status as DisplayStatus;
      coverage.set(winner, (coverage.get(winner) ?? 0) + 1);

      // Check for conflicts: multiple rules matching with DIFFERENT statuses
      const distinctStatuses = new Set(matches.map((m) => m.status));
      if (distinctStatuses.size > 1) {
        issues.push({
          type: 'conflict',
          message: `Multiple statuses match for test case: ${JSON.stringify(testCase)}. Matches: ${matches.map((m) => `${m.status} (${m.rule}, p=${m.priority})`).join(', ')}. Winner by priority: ${winner}`,
          rules: matches.map((m) => m.rule),
        });
      }
    }
  }

  // Check for unclassified cases
  const unclassifiedCount = coverage.get('UNCLASSIFIED') ?? 0;
  if (unclassifiedCount > 0) {
    issues.push({
      type: 'blind_spot',
      message: `${unclassifiedCount} out of ${testCases.length} test cases are UNCLASSIFIED (no rule matches)`,
    });
  }

  return { issues, coverage, totalTestCases: testCases.length, testResults };
}

/**
 * Pretty-print validation results to console.
 */
export async function runValidation() {
  console.log('=== TransferIn Rules Validation ===\n');

  const { issues, coverage, totalTestCases, testResults } =
    await validateRules();

  console.log(`Total synthetic test cases: ${totalTestCases}\n`);

  console.log('--- Coverage ---');
  for (const [status, count] of coverage) {
    const pct = ((count / totalTestCases) * 100).toFixed(1);
    const bar = '█'.repeat(Math.round((count / totalTestCases) * 40));
    console.log(`  ${status.padEnd(20)} ${String(count).padStart(4)} (${pct.padStart(5)}%) ${bar}`);
  }

  console.log('\n--- Issues ---');
  if (issues.length === 0) {
    console.log('  No issues found!');
  } else {
    for (const issue of issues) {
      const icon =
        issue.type === 'conflict'
          ? '[CONFLICT]'
          : issue.type === 'blind_spot'
            ? '[BLIND SPOT]'
            : '[WARNING]';
      console.log(`  ${icon} ${issue.message}`);
    }
  }

  // Show unclassified cases
  const unclassified = testResults.filter((t) => t.matches.length === 0);
  if (unclassified.length > 0) {
    console.log('\n--- Unclassified Cases ---');
    for (const uc of unclassified.slice(0, 10)) {
      console.log(`  ${JSON.stringify(uc.fact)}`);
    }
    if (unclassified.length > 10) {
      console.log(`  ... and ${unclassified.length - 10} more`);
    }
  }

  // Show conflicts
  const conflicts = testResults.filter((t) => {
    const statuses = new Set(t.matches.map((m) => m.status));
    return statuses.size > 1;
  });
  if (conflicts.length > 0) {
    console.log('\n--- Conflict Details ---');
    for (const c of conflicts.slice(0, 10)) {
      console.log(`  Fact: ${JSON.stringify(c.fact)}`);
      console.log(
        `  Matches: ${c.matches.map((m) => `${m.status}(${m.rule}:p${m.priority})`).join(' | ')}`
      );
      console.log();
    }
    if (conflicts.length > 10) {
      console.log(`  ... and ${conflicts.length - 10} more`);
    }
  }

  return { issues, coverage, totalTestCases };
}
