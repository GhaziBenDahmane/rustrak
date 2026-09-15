/**
 * Indents a message body the way anyone would write JSON by hand.
 *
 * The body is JSON with template expressions in it, so `JSON.parse` cannot
 * read it directly: `{"text":{{ issue.title }}}` is not JSON until it renders.
 * So every `{{ … }}` is parked behind a token first, the JSON that remains is
 * formatted, and the expressions go back where they were.
 *
 * A body it cannot parse comes back untouched. Half-written is the normal
 * state of a field somebody is editing, and a formatter that eats your work to
 * punish you for that is worse than no formatter.
 */
export function formatTemplate(template: string): string {
  const { parked, expressions } = parkExpressions(template);

  let formatted: string;
  try {
    formatted = JSON.stringify(JSON.parse(parked), null, 2);
  } catch {
    return template;
  }

  return expressions.reduce(
    (text, expression) => text.replace(expression.token, expression.text),
    formatted,
  );
}

/**
 * Whether the body is JSON once its expressions are set aside: the same test
 * the formatter applies before it touches anything.
 */
export function templateParses(template: string): boolean {
  try {
    JSON.parse(parkExpressions(template).parked);
    return true;
  } catch {
    return false;
  }
}

/**
 * The two shapes a token takes, told apart by name so the restore step puts
 * the quotes back exactly where the reader had them. One token for both would
 * turn `"{{ x }}"` into `{{ x }}`: it renders the same, but it is not what
 * they wrote, and a field inside a string and a field standing alone do not
 * mean the same thing for an absent value.
 */
const stringToken = (index: number) => `__rustrak_str_${index}__`;
const valueToken = (index: number) => `"__rustrak_val_${index}__"`;

interface ParkedExpression {
  /** What stood in the body. */
  text: string;
  /** What stands in its place while the JSON is formatted, quotes included. */
  token: string;
}

/**
 * Replaces every `{{ … }}` with a token, leaving parseable JSON behind.
 *
 * A token has to survive in both places an expression can appear, and those
 * need different shapes: standing where a value goes it must be a JSON value
 * of its own, and inside a string it is already surrounded by the quotes it
 * needs. Which one applies is decided by tracking whether the scan is inside a
 * string literal, which is also what keeps a `{{` typed inside quoted prose
 * from being read as an expression at all.
 */
function parkExpressions(template: string): {
  parked: string;
  expressions: ParkedExpression[];
} {
  const expressions: ParkedExpression[] = [];
  let parked = '';
  let inString = false;

  for (let i = 0; i < template.length; i++) {
    const char = template[i] as string;

    if (inString && char === '\\') {
      parked += char + (template[i + 1] ?? '');
      i++;
      continue;
    }
    if (char === '"') inString = !inString;

    const end =
      char === '{' && template[i + 1] === '{'
        ? template.indexOf('}}', i + 2)
        : -1;
    if (end === -1) {
      parked += char;
      continue;
    }

    const token = inString
      ? stringToken(expressions.length)
      : valueToken(expressions.length);
    parked += token;
    expressions.push({ text: template.slice(i, end + 2), token });
    i = end + 1;
  }

  return { parked, expressions };
}
