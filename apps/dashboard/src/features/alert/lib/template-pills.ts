/**
 * Where the expressions are in a message body, and which of them are plain
 * field references.
 *
 * `{{ issue.title }}` is a field the reader inserted, and the editor draws it
 * as a pill: one thing, deleted in one keystroke, never edited from inside.
 * `{{ issue.title | upper }}` or `{{ "a" ~ b }}` is an expression somebody
 * wrote on purpose, and it stays text so it can be edited. Kept pure so the
 * rule is testable without an editor.
 */
export interface TemplateExpression {
  from: number;
  to: number;
  /** The field path when the expression is nothing but one; otherwise absent. */
  path?: string;
}

/**
 * `{{` that is not the tail of `{{{`: a brace typed before an expression
 * belongs to the JSON around it, not to the expression.
 */
const EXPRESSION = /\{\{(?!\{)([\s\S]*?)\}\}/g;
const FIELD_PATH = /^\s*([A-Za-z_][\w.]*)\s*$/;

export function findExpressions(doc: string): TemplateExpression[] {
  const found: TemplateExpression[] = [];
  for (const match of doc.matchAll(EXPRESSION)) {
    const path = (match[1] as string).match(FIELD_PATH)?.[1];
    found.push({
      from: match.index,
      to: match.index + match[0].length,
      ...(path ? { path } : {}),
    });
  }
  return found;
}
