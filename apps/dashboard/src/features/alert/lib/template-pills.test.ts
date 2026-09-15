import { describe, expect, it } from 'vitest';
import { findExpressions } from './template-pills';

describe('findExpressions', () => {
  it('finds a bare field reference wherever it sits, with its path', () => {
    const doc = '{"a": "Hi {{ issue.title }}", "n": {{issue.event_count}}}';
    expect(findExpressions(doc)).toEqual([
      { from: 10, to: 27, path: 'issue.title' },
      { from: 35, to: 56, path: 'issue.event_count' },
    ]);
  });

  it('finds an expression with operators or filters but gives it no path', () => {
    // Somebody wrote these on purpose; a pill would hide what they wrote.
    const doc = '{{ issue.title | upper }} {{ "a" ~ b }}';
    expect(findExpressions(doc)).toEqual([
      { from: 0, to: 25 },
      { from: 26, to: 39 },
    ]);
  });

  it('does not let a stray brace before the expression swallow it', () => {
    // `{` then `{{ a }}`: the JSON brace is the JSON's, the pill starts after.
    expect(findExpressions('{{{ a }}')).toEqual([
      { from: 1, to: 8, path: 'a' },
    ]);
  });

  it('does not mistake a block or a comment for an expression', () => {
    expect(findExpressions('{% if a %}{{ a }}{% endif %}{# b #}')).toEqual([
      { from: 10, to: 17, path: 'a' },
    ]);
  });

  it('reports a path it does not recognise so the editor can mark it', () => {
    expect(findExpressions('{{ issue.titel }}')[0]?.path).toBe('issue.titel');
  });
});
