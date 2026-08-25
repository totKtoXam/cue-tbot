export type Primitive = string | number | boolean | null;

export type ConditionOperator =
  | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'contains' | 'not_contains' | 'in' | 'not_in'
  | 'empty' | 'not_empty' | 'before' | 'after' | 'between';

export interface ConditionLeaf {
  type: 'condition';
  left: string;
  operator: ConditionOperator;
  right?: Primitive | Primitive[];
}

export interface ConditionGroup {
  type: 'group';
  operator: 'and' | 'or';
  children: ConditionNode[];
}

export type ConditionNode = ConditionLeaf | ConditionGroup;

export interface RuleAction {
  type:
    | 'send_message' | 'skip' | 'stop_run' | 'pause_run'
    | 'change_priority' | 'select_pending' | 'mark_done' | 'webhook';
  config?: Record<string, unknown>;
}

export interface RuleDefinition {
  condition: ConditionNode;
  then: RuleAction[];
  else?: RuleAction[];
}

export interface EvaluationContext {
  [path: string]: unknown;
}

export interface ResolvedRule {
  matched: boolean;
  actions: RuleAction[];
}

function normalize(value: unknown): unknown {
  if (typeof value === 'string') return value.trim();
  return value;
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function compare(left: unknown, right: unknown): number | null {
  const a = asNumber(left);
  const b = asNumber(right);
  if (a != null && b != null) return a === b ? 0 : a > b ? 1 : -1;
  if (typeof left === 'string' && typeof right === 'string') {
    return left === right ? 0 : left > right ? 1 : -1;
  }
  return null;
}

function isEmpty(v: unknown): boolean {
  return v == null || v === '' || (Array.isArray(v) && v.length === 0);
}

export function evaluateLeaf(leaf: ConditionLeaf, ctx: EvaluationContext): boolean {
  const left = normalize(ctx[leaf.left]);
  const right = normalize(leaf.right);
  const cmp = compare(left, right);
  switch (leaf.operator) {
    case 'eq': return left === right;
    case 'neq': return left !== right;
    case 'gt': return cmp != null && cmp > 0;
    case 'gte': return cmp != null && cmp >= 0;
    case 'lt': return cmp != null && cmp < 0;
    case 'lte': return cmp != null && cmp <= 0;
    case 'contains': return Array.isArray(left) ? left.includes(right) : String(left ?? '').includes(String(right ?? ''));
    case 'not_contains': return Array.isArray(left) ? !left.includes(right) : !String(left ?? '').includes(String(right ?? ''));
    case 'in': return Array.isArray(right) && right.includes(left as never);
    case 'not_in': return Array.isArray(right) && !right.includes(left as never);
    case 'empty': return isEmpty(left);
    case 'not_empty': return !isEmpty(left);
    case 'before': return new Date(String(left)).getTime() < new Date(String(right)).getTime();
    case 'after': return new Date(String(left)).getTime() > new Date(String(right)).getTime();
    case 'between': {
      if (!Array.isArray(right) || right.length !== 2) return false;
      const value = String(left ?? '');
      return value >= String(right[0]) && value <= String(right[1]);
    }
  }
}

export function evaluateCondition(node: ConditionNode, ctx: EvaluationContext): boolean {
  if (node.type === 'condition') return evaluateLeaf(node, ctx);
  if (node.children.length === 0) return true;
  return node.operator === 'and'
    ? node.children.every((child) => evaluateCondition(child, ctx))
    : node.children.some((child) => evaluateCondition(child, ctx));
}

export function resolveRule(rule: RuleDefinition | null | undefined, ctx: EvaluationContext): ResolvedRule {
  if (!rule) return { matched: true, actions: [{ type: 'send_message' }] };
  const matched = evaluateCondition(rule.condition, ctx);
  return { matched, actions: matched ? rule.then : (rule.else ?? []) };
}

export function validateCondition(node: ConditionNode, depth = 0): string[] {
  const errors: string[] = [];
  if (depth > 8) errors.push('Condition nesting cannot exceed 8 levels.');
  if (node.type === 'condition') {
    if (!node.left) errors.push('Condition source is required.');
    if (!node.operator) errors.push('Condition operator is required.');
    return errors;
  }
  if (!['and', 'or'].includes(node.operator)) errors.push('Group operator must be AND or OR.');
  for (const child of node.children) errors.push(...validateCondition(child, depth + 1));
  return errors;
}

export function renderTemplate(template: string, values: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_m, key: string) => {
    const value = values[key];
    return value == null ? '' : String(value);
  });
}
