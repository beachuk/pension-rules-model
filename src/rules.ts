import { RuleDefinition } from './types';

/**
 * Rules for categorising TransferIn display status.
 *
 * Rules are evaluated in priority order (highest first).
 * The FIRST matching rule determines the display status.
 *
 * Edit these rules to define your categorisation logic.
 * After editing, run the validator and visualiser to check for conflicts/gaps.
 */
export const transferInRules: RuleDefinition[] = [
  // --- Priority 20: Search outcome states ---
  {
    name: 'potentially-found',
    displayStatus: 'Potentially found',
    priority: 20,
    description: 'Has employer name but no provider identified yet, and status is NotRequested',
    conditions: {
      all: [
        { fact: 'employerName', operator: 'notEqual', value: null },
        { fact: 'cedingProviderName', operator: 'equal', value: null },
        { fact: 'cedingProviderId', operator: 'equal', value: null },
        { fact: 'status', operator: 'equal', value: 'NotRequested' },
      ],
    },
  },

  {
    name: 'found',
    displayStatus: 'Found',
    priority: 25,
    description: 'Provider identified (name or ID), policy number known, and status is NotRequested',
    conditions: {
      any: [
        { fact: 'cedingProviderName', operator: 'notEqual', value: null },
        { fact: 'cedingProviderId', operator: 'notEqual', value: null },
      ],
      all: [
        { fact: 'cedingAccountReference', operator: 'notEqual', value: null },
        { fact: 'status', operator: 'equal', value: 'NotRequested' },
      ],
    },
  },

  // --- Priority 40: Current work ---
  {
    name: 'current-work',
    displayStatus: 'Current work',
    priority: 40,
    description: 'Pension is with current employer and not yet submitted or completed',
    conditions: {
      all: [
        { fact: 'status', operator: 'equal', value: 'ExistingEmployer' },
      ],
    },
  },

  {
    name: 'not-found',
    displayStatus: 'Not found',
    priority: 15,
    description: 'Pension search completed but not found',
    conditions: {
      all: [
        { fact: 'status', operator: 'equal', value: 'NotFound' },
      ],
    },
  },

  // --- Priority 100: Hidden (closed) ---
  {
    name: 'hidden-closed',
    displayStatus: 'Hidden',
    priority: 100,
    description: 'Transfer is closed - hidden from clients',
    conditions: {
      all: [
        { fact: 'closed', operator: 'equal', value: true },
      ],
    },
  },

  // --- Priority 50: Client cancelled ---
  {
    name: 'client-cancelled',
    displayStatus: 'Client cancelled',
    priority: 50,
    description: 'Client has cancelled the transfer and it is not yet closed',
    conditions: {
      all: [
        { fact: 'status', operator: 'equal', value: 'Cancelled' },
        { fact: 'closed', operator: 'equal', value: false },
      ],
    },
  },

  // --- Priority 30+: Terminal / in-progress states ---
  {
    name: 'completed',
    displayStatus: 'Completed',
    priority: 35,
    description: 'Transfer has completed',
    conditions: {
      all: [
        { fact: 'status', operator: 'equal', value: 'Completed' },
      ],
    },
  },
  {
    name: 'transferring',
    displayStatus: 'Transferring',
    priority: 30,
    description: 'Transfer has been submitted to the provider',
    conditions: {
      all: [
        { fact: 'status', operator: 'equal', value: 'Submitted' },
      ],
    },
  },

  // --- Priority 1: Default / catch-all ---
  {
    name: 'searching-default',
    displayStatus: 'Searching',
    priority: 1,
    description: 'Default state - if no other rule matches, the transfer is still being searched for',
    conditions: {
      all: [
        // Always true — this is the catch-all
        { fact: 'id', operator: 'greaterThan', value: 0 },
      ],
    },
  },
];
