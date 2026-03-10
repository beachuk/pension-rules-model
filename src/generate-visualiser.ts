import { transferInRules } from './rules';
import { DISPLAY_STATUSES, RuleDefinition, RuleCondition } from './types';
import { validateRules } from './validator';
import * as fs from 'fs';
import * as path from 'path';

const STATUS_COLOURS: Record<string, string> = {
  Searching: '#FF6B35',
  'Potentially found': '#fbbf24',
  Found: '#34d399',
  Transferring: '#60a5fa',
  Completed: '#34d399',
  'Current work': '#a78bfa',
  'Not found': '#f87171',
  'Client cancelled': '#f87171',
  Hidden: '#9ca3af',
  UNCLASSIFIED: '#dc2626',
};

const STATUS_CSS_CLASS: Record<string, string> = {
  Searching: 'searching',
  'Potentially found': 'potentially-found',
  Found: 'found',
  Transferring: 'transferring',
  Completed: 'completed',
  'Current work': 'current-work',
  'Not found': 'not-found',
  'Client cancelled': 'cancelled',
  Hidden: 'hidden',
};

const STATUS_ICONS: Record<string, string> = {
  Searching:
    '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  'Potentially found':
    '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
  Found:
    '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/><line x1="11" y1="8" x2="11" y2="14"/>',
  Transferring:
    '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  Completed:
    '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  'Current work':
    '<rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  'Not found':
    '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/>',
  'Client cancelled':
    '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
  Hidden:
    '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>',
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function conditionToText(cond: RuleCondition): string {
  const opMap: Record<string, string> = {
    equal: '=',
    notEqual: '!=',
    greaterThan: '>',
    lessThan: '<',
    greaterThanInclusive: '>=',
    lessThanInclusive: '<=',
    in: 'in',
    notIn: 'not in',
    contains: 'contains',
  };
  const op = opMap[cond.operator] ?? cond.operator;
  const val = cond.value === null ? 'null' : JSON.stringify(cond.value);
  return `${cond.fact} ${op} ${val}`;
}

/** Human-readable condition text for the flow page */
function conditionToFriendly(cond: RuleCondition): string {
  const friendlyNames: Record<string, string> = {
    cedingProviderName: 'providerName',
    cedingProviderId: 'providerId',
    cedingAccountReference: 'policyNumber',
    hasIncompleteActions: 'has incomplete actions',
    cancellationRequested: 'cancellationRequested',
  };
  const name = friendlyNames[cond.fact as string] ?? cond.fact;

  if (cond.operator === 'equal' && cond.value === null) return `${name} not set`;
  if (cond.operator === 'notEqual' && cond.value === null) return `${name} set`;
  if (cond.operator === 'equal' && cond.value === true) return `${name} = true`;
  if (cond.operator === 'equal' && cond.value === false) return `${name} = false`;
  if (cond.operator === 'greaterThan' && cond.fact === 'id') return 'Always matches';

  const opMap: Record<string, string> = {
    equal: '=',
    notEqual: '!=',
    greaterThan: '>',
    lessThan: '<',
  };
  const op = opMap[cond.operator] ?? cond.operator;
  return `${name} ${op} "${cond.value}"`;
}

function ruleToConditionsSummary(rule: RuleDefinition): string[] {
  const lines: string[] = [];
  if (rule.conditions.all) {
    for (const cond of rule.conditions.all) {
      lines.push(conditionToText(cond));
    }
  }
  if (rule.conditions.any) {
    lines.push('ANY of:');
    for (const cond of rule.conditions.any) {
      lines.push('  ' + conditionToText(cond));
    }
  }
  return lines;
}

// ─── Flow page (Beach-styled) ───────────────────────────────────────────────

function generateFlowHTML(sortedRules: RuleDefinition[]): string {
  const flowSteps = sortedRules.map((rule, i) => {
    const cssClass = STATUS_CSS_CLASS[rule.displayStatus] ?? 'searching';
    const icon = STATUS_ICONS[rule.displayStatus] ?? STATUS_ICONS['Searching'];
    const isLast = i === sortedRules.length - 1;
    const priorityLabel = rule.priority === 1 ? 'Default' : `Priority ${rule.priority}`;

    // Build condition pills with visual grouping
    let condPills = '';
    const allConds = rule.conditions.all ?? [];
    const anyConds = rule.conditions.any ?? [];
    const hasMultipleGroups = anyConds.length > 0 && allConds.length > 0;

    if (hasMultipleGroups) {
      // Render grouped: (ANY group) AND (ALL group)
      let anyPills = '';
      anyConds.forEach((cond, ci) => {
        if (ci > 0) anyPills += '<span class="condition-join">or</span>';
        anyPills += `<span class="condition-pill">${escapeHtml(conditionToFriendly(cond))}</span>`;
      });
      condPills += `<div class="condition-group"><span class="group-label">Any of</span><div class="group-pills">${anyPills}</div></div>`;

      condPills += '<span class="condition-join group-join">and</span>';

      let allPills = '';
      allConds.forEach((cond, ci) => {
        if (ci > 0) allPills += '<span class="condition-join">and</span>';
        allPills += `<span class="condition-pill">${escapeHtml(conditionToFriendly(cond))}</span>`;
      });
      condPills += `<div class="condition-group"><span class="group-label">All of</span><div class="group-pills">${allPills}</div></div>`;
    } else {
      // Single group — render flat
      const conds = allConds.length > 0 ? allConds : anyConds;
      const joinWord = allConds.length > 0 ? 'and' : 'or';
      conds.forEach((cond, ci) => {
        if (ci > 0) condPills += `<span class="condition-join">${joinWord}</span>`;
        condPills += `<span class="condition-pill">${escapeHtml(conditionToFriendly(cond))}</span>`;
      });
    }

    const arrow = isLast
      ? ''
      : `<div class="flow-arrow">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
          no match &mdash; continue
        </div>`;

    return `
      <div class="flow-step status-${cssClass}">
        <div class="flow-dot">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon}</svg>
        </div>
        <div class="flow-card">
          <div class="flow-card-header">
            <span class="flow-status-name">${escapeHtml(rule.displayStatus)}</span>
            <span class="flow-priority">${priorityLabel}</span>
          </div>
          <div class="flow-description">${escapeHtml(rule.description)}</div>
          <div class="flow-conditions">${condPills}</div>
        </div>
      </div>
      ${arrow}`;
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Pension Transfer Status Rules</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans:wght@300;400;500;600;700&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --orange: #FF6B35;
    --orange-light: #FF8C5E;
    --orange-glow: rgba(255, 107, 53, 0.12);
    --dark: #1a1a2e;
    --dark-card: #232340;
    --dark-border: #2e2e50;
    --text-primary: #ffffff;
    --text-secondary: #a0a0be;
    --text-muted: #6b6b88;
    --green: #34d399;
    --green-bg: rgba(52, 211, 153, 0.1);
    --blue: #60a5fa;
    --blue-bg: rgba(96, 165, 250, 0.1);
    --purple: #a78bfa;
    --purple-bg: rgba(167, 139, 250, 0.1);
    --amber: #fbbf24;
    --amber-bg: rgba(251, 191, 36, 0.1);
    --red: #f87171;
    --red-bg: rgba(248, 113, 113, 0.1);
    --grey: #9ca3af;
    --grey-bg: rgba(156, 163, 175, 0.08);
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Noto Sans', sans-serif;
    background: var(--dark);
    color: var(--text-primary);
    min-height: 100vh;
  }

  .header {
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    border-bottom: 1px solid var(--dark-border);
    padding: 32px 0;
    text-align: center;
  }
  .header-inner { max-width: 800px; margin: 0 auto; padding: 0 24px; }
  .header h1 { font-family: 'Outfit', sans-serif; font-weight: 700; font-size: 28px; margin-bottom: 8px; }
  .header h1 span { color: var(--orange); }
  .header p { font-size: 15px; color: var(--text-secondary); font-weight: 300; }

  .content { max-width: 800px; margin: 0 auto; padding: 40px 24px 80px; }
  .intro { text-align: center; margin-bottom: 48px; }
  .intro p { font-size: 14px; color: var(--text-secondary); line-height: 1.7; max-width: 560px; margin: 0 auto; }

  .flow { position: relative; padding-left: 48px; }
  .flow::before {
    content: '';
    position: absolute;
    left: 19px; top: 28px; bottom: 28px;
    width: 2px;
    background: linear-gradient(to bottom, var(--orange) 0%, var(--dark-border) 30%, var(--dark-border) 70%, var(--text-muted) 100%);
  }

  .flow-step { position: relative; margin-bottom: 20px; }
  .flow-step:last-child { margin-bottom: 0; }

  .flow-dot {
    position: absolute; left: -48px; top: 22px;
    width: 40px; height: 40px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 16px; z-index: 1; border: 2px solid var(--dark);
  }

  .flow-card {
    background: var(--dark-card);
    border: 1px solid var(--dark-border);
    border-radius: 12px;
    padding: 20px 24px;
    transition: all 0.2s ease;
  }
  .flow-card:hover {
    border-color: var(--orange);
    box-shadow: 0 0 20px var(--orange-glow);
    transform: translateX(4px);
  }

  .flow-card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; gap: 12px; flex-wrap: wrap; }
  .flow-status-name { font-family: 'Outfit', sans-serif; font-weight: 600; font-size: 18px; }
  .flow-priority { font-size: 11px; color: var(--text-muted); background: rgba(255,255,255,0.05); padding: 3px 10px; border-radius: 20px; font-weight: 500; letter-spacing: 0.5px; text-transform: uppercase; }
  .flow-description { font-size: 13px; color: var(--text-secondary); margin-bottom: 14px; line-height: 1.5; }
  .flow-conditions { display: flex; flex-wrap: wrap; gap: 6px; }
  .condition-pill { font-size: 12px; padding: 5px 12px; border-radius: 6px; font-family: 'Noto Sans', monospace; font-weight: 500; display: inline-flex; align-items: center; gap: 4px; }
  .condition-join { font-size: 11px; color: var(--text-muted); padding: 5px 4px; font-weight: 600; text-transform: uppercase; }
  .condition-join.group-join { padding: 8px 6px; }

  .condition-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 8px;
    padding: 8px 10px;
    background: rgba(255,255,255,0.02);
  }
  .group-label {
    font-size: 10px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 600;
  }
  .group-pills { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }

  .flow-conditions { align-items: center; }

  .flow-arrow { display: flex; align-items: center; gap: 8px; padding: 6px 0 6px 4px; font-size: 12px; color: var(--text-muted); }

  /* Status colours */
  .status-hidden .flow-dot { background: var(--grey-bg); border-color: var(--grey); color: var(--grey); }
  .status-hidden .flow-status-name { color: var(--grey); }
  .status-hidden .condition-pill { background: var(--grey-bg); color: var(--grey); border: 1px solid rgba(156,163,175,0.15); }

  .status-cancelled .flow-dot { background: var(--red-bg); border-color: var(--red); color: var(--red); }
  .status-cancelled .flow-status-name { color: var(--red); }
  .status-cancelled .condition-pill { background: var(--red-bg); color: var(--red); border: 1px solid rgba(248,113,113,0.15); }

  .status-current-work .flow-dot { background: var(--purple-bg); border-color: var(--purple); color: var(--purple); }
  .status-current-work .flow-status-name { color: var(--purple); }
  .status-current-work .condition-pill { background: var(--purple-bg); color: var(--purple); border: 1px solid rgba(167,139,250,0.15); }

  .status-completed .flow-dot { background: var(--green-bg); border-color: var(--green); color: var(--green); }
  .status-completed .flow-status-name { color: var(--green); }
  .status-completed .condition-pill { background: var(--green-bg); color: var(--green); border: 1px solid rgba(52,211,153,0.15); }

  .status-transferring .flow-dot { background: var(--blue-bg); border-color: var(--blue); color: var(--blue); }
  .status-transferring .flow-status-name { color: var(--blue); }
  .status-transferring .condition-pill { background: var(--blue-bg); color: var(--blue); border: 1px solid rgba(96,165,250,0.15); }

  .status-found .flow-dot { background: var(--green-bg); border-color: var(--green); color: var(--green); }
  .status-found .flow-status-name { color: var(--green); }
  .status-found .condition-pill { background: var(--green-bg); color: var(--green); border: 1px solid rgba(52,211,153,0.15); }

  .status-potentially-found .flow-dot { background: var(--amber-bg); border-color: var(--amber); color: var(--amber); }
  .status-potentially-found .flow-status-name { color: var(--amber); }
  .status-potentially-found .condition-pill { background: var(--amber-bg); color: var(--amber); border: 1px solid rgba(251,191,36,0.15); }

  .status-not-found .flow-dot { background: var(--red-bg); border-color: var(--red); color: var(--red); }
  .status-not-found .flow-status-name { color: var(--red); }
  .status-not-found .condition-pill { background: var(--red-bg); color: var(--red); border: 1px solid rgba(248,113,113,0.15); }

  .status-searching .flow-dot { background: var(--orange-glow); border-color: var(--orange); color: var(--orange); }
  .status-searching .flow-status-name { color: var(--orange); }
  .status-searching .condition-pill { background: var(--orange-glow); color: var(--orange); border: 1px solid rgba(255,107,53,0.15); }

  .footer { text-align: center; padding: 32px 24px; border-top: 1px solid var(--dark-border); color: var(--text-muted); font-size: 12px; }

  @media (max-width: 600px) {
    .content { padding: 24px 16px 60px; }
    .flow { padding-left: 40px; }
    .flow::before { left: 15px; }
    .flow-dot { left: -40px; width: 32px; height: 32px; font-size: 13px; }
    .flow-card { padding: 16px; }
    .flow-status-name { font-size: 16px; }
  }
</style>
</head>
<body>
  <div class="header">
    <div class="header-inner">
      <h1>Pension Transfer <span>Status Rules</span></h1>
      <p>How each SIPP transfer-in is categorised for display</p>
    </div>
  </div>
  <div class="content">
    <div class="intro">
      <p>Each pension transfer is evaluated against these rules in priority order, highest first. The first matching rule determines the display status shown to clients.</p>
    </div>
    <div class="flow">
      ${flowSteps.join('\n')}
    </div>
  </div>
  <div class="footer">
    Pension Transfer Status Rules &middot; Generated ${new Date().toISOString().slice(0, 16)} &middot; ${sortedRules.length} rules
  </div>
</body>
</html>`;
}

// ─── Debug / technical page ─────────────────────────────────────────────────

async function generateDebugHTML(): Promise<string> {
  const validation = await validateRules();
  const sortedRules = [...transferInRules].sort(
    (a, b) => b.priority - a.priority
  );

  const ruleCards = sortedRules
    .map((rule) => {
      const colour = STATUS_COLOURS[rule.displayStatus] ?? '#888';
      const conditions = ruleToConditionsSummary(rule);
      const condHtml = conditions
        .map((c) => `<div class="condition">${escapeHtml(c)}</div>`)
        .join('');

      return `
      <div class="rule-card" data-status="${escapeHtml(rule.displayStatus)}" style="border-left: 5px solid ${colour}">
        <div class="rule-header">
          <span class="rule-name">${escapeHtml(rule.name)}</span>
          <span class="rule-priority">Priority: ${rule.priority}</span>
          <span class="rule-status" style="background: ${colour}">${escapeHtml(rule.displayStatus)}</span>
        </div>
        <div class="rule-description">${escapeHtml(rule.description)}</div>
        <div class="conditions-block">
          <div class="conditions-label">ALL conditions:</div>
          ${condHtml}
        </div>
      </div>`;
    })
    .join('\n');

  const coverageRows = Array.from(validation.coverage.entries())
    .map(([status, count]) => {
      const pct = ((count / validation.totalTestCases) * 100).toFixed(1);
      const colour = STATUS_COLOURS[status] ?? '#888';
      return `<tr>
        <td><span class="status-dot" style="background:${colour}"></span>${escapeHtml(status)}</td>
        <td>${count}</td>
        <td>${pct}%</td>
        <td><div class="bar" style="width:${pct}%;background:${colour}"></div></td>
      </tr>`;
    })
    .join('\n');

  const issueRows = validation.issues
    .map((issue) => {
      const cls =
        issue.type === 'conflict'
          ? 'issue-conflict'
          : issue.type === 'blind_spot'
            ? 'issue-blind-spot'
            : 'issue-warning';
      const label = issue.type.toUpperCase().replace('_', ' ');
      return `<div class="issue ${cls}"><span class="issue-type">${label}</span> ${escapeHtml(issue.message)}</div>`;
    })
    .join('\n');

  const flowNodes = sortedRules.map((rule, i) => ({
    name: rule.name,
    status: rule.displayStatus,
    priority: rule.priority,
    conditions: ruleToConditionsSummary(rule),
    colour: STATUS_COLOURS[rule.displayStatus] ?? '#888',
    index: i,
  }));

  const conflictDetails = validation.testResults
    .filter((t) => {
      const statuses = new Set(t.matches.map((m) => m.status));
      return statuses.size > 1;
    })
    .slice(0, 20)
    .map((c) => {
      return `<div class="conflict-detail">
        <div class="conflict-fact"><strong>Fact:</strong> <code>${escapeHtml(JSON.stringify(c.fact, null, 0))}</code></div>
        <div class="conflict-matches">${c.matches.map((m) => `<span class="match-tag" style="background:${STATUS_COLOURS[m.status] ?? '#888'}">${escapeHtml(m.status)} (${escapeHtml(m.rule)}, p=${m.priority})</span>`).join(' ')}</div>
      </div>`;
    })
    .join('\n');

  const unclassifiedDetails = validation.testResults
    .filter((t) => t.matches.length === 0)
    .slice(0, 20)
    .map((u) => {
      return `<div class="unclassified-detail"><code>${escapeHtml(JSON.stringify(u.fact, null, 0))}</code></div>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SIPP TransferIn Rules — Debug</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; padding: 24px; }
  h1 { font-size: 24px; margin-bottom: 8px; color: #f1f5f9; }
  h2 { font-size: 18px; margin: 32px 0 16px; color: #94a3b8; border-bottom: 1px solid #334155; padding-bottom: 8px; }
  .subtitle { color: #64748b; margin-bottom: 24px; }
  .stats { display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
  .stat-card { background: #1e293b; border-radius: 8px; padding: 16px 24px; flex: 1; min-width: 150px; }
  .stat-value { font-size: 32px; font-weight: 700; color: #f1f5f9; }
  .stat-label { font-size: 13px; color: #64748b; margin-top: 4px; }
  .filters { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
  .filter-btn { padding: 6px 14px; border-radius: 16px; border: 1px solid #334155; background: #1e293b; color: #94a3b8; cursor: pointer; font-size: 13px; transition: all 0.15s; }
  .filter-btn:hover { border-color: #64748b; }
  .filter-btn.active { background: var(--btn-colour); color: #fff; border-color: var(--btn-colour); }
  .rules-grid { display: flex; flex-direction: column; gap: 12px; }
  .rule-card { background: #1e293b; border-radius: 8px; padding: 16px; transition: opacity 0.2s; }
  .rule-card.dimmed { opacity: 0.2; }
  .rule-header { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; flex-wrap: wrap; }
  .rule-name { font-weight: 600; font-size: 15px; color: #f1f5f9; }
  .rule-priority { font-size: 12px; color: #64748b; background: #334155; padding: 2px 8px; border-radius: 8px; }
  .rule-status { font-size: 12px; color: #fff; padding: 2px 10px; border-radius: 8px; margin-left: auto; }
  .rule-description { font-size: 13px; color: #94a3b8; margin-bottom: 10px; }
  .conditions-block { background: #0f172a; border-radius: 6px; padding: 10px 14px; }
  .conditions-label { font-size: 11px; color: #64748b; text-transform: uppercase; margin-bottom: 6px; }
  .condition { font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 13px; color: #cbd5e1; padding: 2px 0; }
  .flow-container { position: relative; padding: 20px 0; }
  .flow-node { display: flex; align-items: stretch; margin-bottom: 8px; position: relative; }
  .flow-connector { width: 40px; display: flex; flex-direction: column; align-items: center; position: relative; }
  .flow-connector::before { content: ''; position: absolute; top: 0; bottom: 0; width: 2px; background: #334155; }
  .flow-dot { width: 14px; height: 14px; border-radius: 50%; z-index: 1; margin-top: 18px; border: 2px solid #0f172a; }
  .flow-body { flex: 1; background: #1e293b; border-radius: 8px; padding: 12px 16px; margin-left: 8px; }
  .flow-body .rule-name { font-size: 14px; }
  .flow-arrow { color: #475569; font-size: 11px; margin-top: 4px; display: block; }
  .flow-node:last-child .flow-connector::before { height: 50%; }
  table { width: 100%; border-collapse: collapse; background: #1e293b; border-radius: 8px; overflow: hidden; }
  th { text-align: left; padding: 10px 14px; background: #334155; color: #94a3b8; font-size: 12px; text-transform: uppercase; }
  td { padding: 10px 14px; border-top: 1px solid #1e293b; font-size: 14px; }
  .status-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 8px; }
  .bar { height: 18px; border-radius: 3px; min-width: 2px; }
  .issue { padding: 12px 16px; border-radius: 8px; margin-bottom: 8px; font-size: 13px; line-height: 1.5; }
  .issue-type { font-weight: 700; font-size: 11px; padding: 2px 8px; border-radius: 4px; margin-right: 8px; }
  .issue-conflict { background: #451a03; border: 1px solid #92400e; }
  .issue-conflict .issue-type { background: #f59e0b; color: #000; }
  .issue-blind-spot { background: #450a0a; border: 1px solid #991b1b; }
  .issue-blind-spot .issue-type { background: #ef4444; color: #fff; }
  .issue-warning { background: #172554; border: 1px solid #1e40af; }
  .issue-warning .issue-type { background: #3b82f6; color: #fff; }
  .no-issues { background: #052e16; border: 1px solid #166534; padding: 16px; border-radius: 8px; color: #4ade80; }
  .conflict-detail, .unclassified-detail { background: #1e293b; padding: 10px 14px; border-radius: 6px; margin-bottom: 6px; font-size: 13px; }
  .conflict-detail code, .unclassified-detail code { font-size: 12px; color: #94a3b8; word-break: break-all; }
  .match-tag { display: inline-block; padding: 2px 8px; border-radius: 4px; color: #fff; font-size: 11px; margin: 2px; }
  .tabs { display: flex; gap: 0; margin-bottom: 0; }
  .tab { padding: 10px 20px; background: #1e293b; color: #64748b; cursor: pointer; border: 1px solid #334155; border-bottom: none; border-radius: 8px 8px 0 0; font-size: 14px; }
  .tab.active { background: #334155; color: #f1f5f9; }
  .tab-content { display: none; background: #1e293b0a; border: 1px solid #334155; border-radius: 0 8px 8px 8px; padding: 20px; }
  .tab-content.active { display: block; }
</style>
</head>
<body>
  <h1>SIPP TransferIn Rules — Debug</h1>
  <p class="subtitle">Generated ${new Date().toISOString().slice(0, 16)} &mdash; ${transferInRules.length} rules, ${DISPLAY_STATUSES.length} statuses</p>

  <div class="stats">
    <div class="stat-card"><div class="stat-value">${transferInRules.length}</div><div class="stat-label">Rules defined</div></div>
    <div class="stat-card"><div class="stat-value">${DISPLAY_STATUSES.length}</div><div class="stat-label">Display statuses</div></div>
    <div class="stat-card"><div class="stat-value">${validation.totalTestCases}</div><div class="stat-label">Test cases generated</div></div>
    <div class="stat-card"><div class="stat-value" style="color: ${validation.issues.filter((i) => i.type === 'conflict').length > 0 ? '#f59e0b' : '#4ade80'}">${validation.issues.filter((i) => i.type === 'conflict').length}</div><div class="stat-label">Conflicts</div></div>
    <div class="stat-card"><div class="stat-value" style="color: ${(validation.coverage.get('UNCLASSIFIED') ?? 0) > 0 ? '#ef4444' : '#4ade80'}">${validation.coverage.get('UNCLASSIFIED') ?? 0}</div><div class="stat-label">Blind spots</div></div>
  </div>

  <div class="tabs">
    <div class="tab active" onclick="switchTab('flow')">Priority Flow</div>
    <div class="tab" onclick="switchTab('rules')">Rule Cards</div>
    <div class="tab" onclick="switchTab('coverage')">Coverage</div>
    <div class="tab" onclick="switchTab('issues')">Issues (${validation.issues.length})</div>
  </div>

  <div class="tab-content active" id="tab-flow">
    <p style="color:#64748b;margin-bottom:16px;font-size:13px">Rules evaluated top-to-bottom by priority. First match wins.</p>
    <div class="flow-container">
      ${flowNodes
        .map(
          (node, i) => `
        <div class="flow-node">
          <div class="flow-connector">
            <div class="flow-dot" style="background:${node.colour}"></div>
          </div>
          <div class="flow-body" style="border-left:3px solid ${node.colour}">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
              <span class="rule-name">${escapeHtml(node.name)}</span>
              <span class="rule-status" style="background:${node.colour}">${escapeHtml(node.status)}</span>
            </div>
            <div style="margin-top:6px;font-family:monospace;font-size:12px;color:#94a3b8">
              ${node.conditions.map((c) => escapeHtml(c)).join(' <span style="color:#475569">&amp;&amp;</span> ')}
            </div>
            ${i < flowNodes.length - 1 ? '<span class="flow-arrow">&#8595; no match? continue...</span>' : '<span class="flow-arrow" style="color:#ef4444">&#8623; UNCLASSIFIED if no match</span>'}
          </div>
        </div>`
        )
        .join('\n')}
    </div>
  </div>

  <div class="tab-content" id="tab-rules">
    <div class="filters">
      <button class="filter-btn active" style="--btn-colour:#64748b" onclick="filterRules('all')">All</button>
      ${DISPLAY_STATUSES.map(
        (s) =>
          `<button class="filter-btn" style="--btn-colour:${STATUS_COLOURS[s] ?? '#888'}" onclick="filterRules('${escapeHtml(s)}')">${escapeHtml(s)}</button>`
      ).join('\n')}
    </div>
    <div class="rules-grid">${ruleCards}</div>
  </div>

  <div class="tab-content" id="tab-coverage">
    <table>
      <thead><tr><th>Status</th><th>Count</th><th>%</th><th>Distribution</th></tr></thead>
      <tbody>${coverageRows}</tbody>
    </table>
  </div>

  <div class="tab-content" id="tab-issues">
    ${validation.issues.length === 0 ? '<div class="no-issues">No issues found! All test cases are classified without conflicts.</div>' : issueRows}
    ${conflictDetails ? '<h2>Conflict Details</h2>' + conflictDetails : ''}
    ${unclassifiedDetails ? '<h2>Unclassified Cases</h2>' + unclassifiedDetails : ''}
  </div>

  <script>
    function switchTab(name) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      event.target.classList.add('active');
      document.getElementById('tab-' + name).classList.add('active');
    }
    function filterRules(status) {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      event.target.classList.add('active');
      document.querySelectorAll('.rule-card').forEach(card => {
        if (status === 'all' || card.dataset.status === status) {
          card.classList.remove('dimmed');
        } else {
          card.classList.add('dimmed');
        }
      });
    }
  </script>
</body>
</html>`;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const sortedRules = [...transferInRules].sort(
    (a, b) => b.priority - a.priority
  );
  const outDir = path.join(__dirname, '..', 'visualiser');

  // Generate both pages
  const flowHtml = generateFlowHTML(sortedRules);
  const debugHtml = await generateDebugHTML();

  fs.writeFileSync(path.join(outDir, 'flow.html'), flowHtml, 'utf-8');
  fs.writeFileSync(path.join(outDir, 'index.html'), debugHtml, 'utf-8');

  console.log(`Flow visualiser written to  ${path.join(outDir, 'flow.html')}`);
  console.log(`Debug visualiser written to ${path.join(outDir, 'index.html')}`);
}

main().catch(console.error);
