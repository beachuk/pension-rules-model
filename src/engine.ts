import { Engine } from 'json-rules-engine';
import { transferInRules } from './rules';
import { DisplayStatus, TransferInFact, RuleDefinition } from './types';

/**
 * Build a json-rules-engine Engine from our rule definitions.
 * Each rule fires an event with the displayStatus as the event type.
 */
export function buildEngine(rules: RuleDefinition[] = transferInRules): Engine {
  const engine = new Engine([], { allowUndefinedFacts: true });

  for (const rule of rules) {
    engine.addRule({
      name: rule.name,
      priority: rule.priority,
      conditions: rule.conditions as any,
      event: {
        type: rule.displayStatus,
        params: {
          ruleName: rule.name,
          description: rule.description,
        },
      },
    });
  }

  return engine;
}

export interface ClassificationResult {
  transferId: number;
  displayStatus: DisplayStatus | 'UNCLASSIFIED';
  matchedRule: string | null;
  allMatches: { status: DisplayStatus; rule: string; priority: number }[];
}

/**
 * Classify a single TransferIn fact through the engine.
 * Returns the highest-priority matching status.
 */
export async function classifyTransferIn(
  fact: TransferInFact,
  engine?: Engine
): Promise<ClassificationResult> {
  const e = engine ?? buildEngine();
  const result = await e.run(fact);

  const allMatches = result.events
    .map((event) => {
      const ruleDef = transferInRules.find(
        (r) => r.name === event.params?.ruleName
      );
      return {
        status: event.type as DisplayStatus,
        rule: event.params?.ruleName as string,
        priority: ruleDef?.priority ?? 0,
      };
    })
    .sort((a, b) => b.priority - a.priority);

  if (allMatches.length === 0) {
    return {
      transferId: fact.id,
      displayStatus: 'UNCLASSIFIED',
      matchedRule: null,
      allMatches: [],
    };
  }

  return {
    transferId: fact.id,
    displayStatus: allMatches[0].status,
    matchedRule: allMatches[0].rule,
    allMatches,
  };
}

/**
 * Classify a batch of TransferIn facts.
 */
export async function classifyBatch(
  facts: TransferInFact[]
): Promise<ClassificationResult[]> {
  const engine = buildEngine();
  return Promise.all(facts.map((fact) => classifyTransferIn(fact, engine)));
}
