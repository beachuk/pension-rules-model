import { RuleDefinition } from './types';

/**
 * Rules for categorising TransferIn display status.
 *
 * Rules are evaluated in priority order (highest first).
 * The FIRST matching rule determines the display status.
 *
 * Edit these rules to define your categorisation logic.
 * After editing, run the validator and visualiser to check for conflicts/gaps.
 *
 * Mirrored in backshore at src/transfers/pensionCategorisation/rules.ts —
 * keep the two in sync.
 */
export const transferInRules: RuleDefinition[] = [
  {
    name: 'potentially-found',
    displayStatus: 'Potentially found',
    priority: 20,
    description:
      'Has some identifying info (employer, provider name, or provider ID), at least one incomplete action, and no account reference yet',
    conditions: {
      all: [
        { fact: 'hasIncompleteActions', operator: 'equal', value: true },
        { fact: 'cedingAccountReference', operator: 'equal', value: null },
        {
          any: [
            { fact: 'employerName', operator: 'notEqual', value: null },
            { fact: 'cedingProviderName', operator: 'notEqual', value: null },
            { fact: 'cedingProviderId', operator: 'notEqual', value: null },
          ],
        },
      ],
    },
  },
  {
    name: 'found',
    displayStatus: 'Found',
    priority: 25,
    description:
      'Provider identified (name or ID), policy number known, and status is NotRequested',
    conditions: {
      all: [
        { fact: 'cedingAccountReference', operator: 'notEqual', value: null },
        { fact: 'estimatedTransferValue', operator: 'notEqual', value: null },
        { fact: 'status', operator: 'equal', value: 'NotRequested' },
        {
          any: [
            { fact: 'cedingProviderName', operator: 'notEqual', value: null },
            { fact: 'cedingProviderId', operator: 'notEqual', value: null },
          ],
        },
      ],
    },
  },
  {
    name: 'current-work',
    displayStatus: 'Current work',
    priority: 110,
    description:
      'Beach-owned: pension is with current employer. Wins over WK terminal statuses (Completed/Cancelled/Rejected) but not over closed.',
    conditions: {
      all: [
        {
          fact: 'trackerStatus',
          operator: 'equal',
          value: 'CurrentEmployerPension',
        },
        { fact: 'closed', operator: 'equal', value: false },
      ],
    },
  },
  {
    name: 'not-found',
    displayStatus: 'Not found',
    priority: 110,
    description:
      'Beach-owned: pension search completed but not found. Wins over WK terminal statuses but not over closed.',
    conditions: {
      all: [
        { fact: 'trackerStatus', operator: 'equal', value: 'NotFound' },
        { fact: 'closed', operator: 'equal', value: false },
      ],
    },
  },
  {
    name: 'defined-benefit',
    displayStatus: 'Defined Benefit',
    priority: 110,
    description:
      'Beach-owned: pension is a defined-benefit scheme and not being transferred. Wins over WK terminal statuses but not over closed.',
    conditions: {
      all: [
        { fact: 'trackerStatus', operator: 'equal', value: 'DefinedBenefit' },
        { fact: 'closed', operator: 'equal', value: false },
      ],
    },
  },
  {
    name: 'not-transferring',
    displayStatus: 'Not transferring',
    priority: 110,
    description:
      'Beach-owned: pension was found but the client has decided not to transfer it. Wins over WK terminal statuses but not over closed.',
    conditions: {
      all: [
        { fact: 'trackerStatus', operator: 'equal', value: 'NotTransferring' },
        { fact: 'closed', operator: 'equal', value: false },
      ],
    },
  },
  {
    name: 'hidden-closed',
    displayStatus: 'Hidden',
    priority: 100,
    description: 'Transfer is closed - hidden from clients',
    conditions: {
      all: [{ fact: 'closed', operator: 'equal', value: true }],
    },
  },
  {
    name: 'hidden-rejected',
    displayStatus: 'Hidden',
    priority: 100,
    description: 'Transfer was rejected - hidden from clients',
    conditions: {
      all: [{ fact: 'status', operator: 'equal', value: 'Rejected' }],
    },
  },
  {
    name: 'client-cancelled',
    displayStatus: 'Cancelled',
    priority: 50,
    description: 'Client has cancelled the transfer and it is not yet closed',
    conditions: {
      all: [
        { fact: 'status', operator: 'equal', value: 'Cancelled' },
        { fact: 'closed', operator: 'equal', value: false },
      ],
    },
  },
  {
    name: 'completed',
    displayStatus: 'Completed',
    priority: 35,
    description: 'Transfer has completed',
    conditions: {
      all: [{ fact: 'status', operator: 'equal', value: 'Completed' }],
    },
  },
  {
    name: 'transferring',
    displayStatus: 'Transferring',
    priority: 30,
    description:
      'Transfer has a provider reference and status is Pending, Submitted, Accepted, or Transferring',
    conditions: {
      all: [
        { fact: 'reference', operator: 'notEqual', value: null },
        {
          any: [
            { fact: 'status', operator: 'equal', value: 'Pending' },
            { fact: 'status', operator: 'equal', value: 'Submitted' },
            { fact: 'status', operator: 'equal', value: 'Accepted' },
            { fact: 'status', operator: 'equal', value: 'Transferring' },
          ],
        },
      ],
    },
  },
  {
    name: 'searching-default',
    displayStatus: 'Searching',
    priority: 1,
    description:
      'Default state - if no other rule matches, the transfer is still being searched for',
    conditions: {
      all: [{ fact: 'id', operator: 'greaterThan', value: 0 }],
    },
  },
];
