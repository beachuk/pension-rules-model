/** Display statuses for SIPP TransferIn */
export const DISPLAY_STATUSES = [
  'Searching',
  'Potentially found',
  'Found',
  'Transferring',
  'Completed',
  'Current work',
  'Defined Benefit',
  'Not found',
  'Cancelled',
  'Hidden',
] as const;

export type DisplayStatus = (typeof DISPLAY_STATUSES)[number];

/**
 * The fact shape fed into the rules engine.
 * Mirrors the Prisma TransferIn model fields relevant to categorisation.
 */
export interface TransferInFact {
  id: number;
  status: string | null;
  trackerStatus: string | null;
  cancellationRequested: boolean;
  closed: boolean;
  reference: string | null;
  transferAllFound: boolean | null;
  estimatedTransferValue: number | null;
  cedingProviderId: string | null;
  cedingProviderName: string | null;
  cedingAccountReference: string | null;
  employerName: string | null;
  hasIncompleteActions: boolean; // derived: any Action where completed is null
  hasAddress: string | null;
  pollId: number | null;
  pollCompletedAt: string | null; // flattened from TransferInPoll
  type: string;
  transferMethod: string;
  transferProportion: string;
  contribution: number | null;
}

export interface RuleDefinition {
  name: string;
  displayStatus: DisplayStatus;
  priority: number; // higher = evaluated first
  conditions: RuleConditionGroup;
  description: string;
}

export interface RuleConditionGroup {
  all?: RuleCondition[];
  any?: RuleCondition[];
}

export type RuleCondition =
  | {
      fact: keyof TransferInFact;
      operator: string;
      value: unknown;
      all?: RuleCondition[];
      any?: RuleCondition[];
    }
  | {
      all?: RuleCondition[];
      any?: RuleCondition[];
    };
