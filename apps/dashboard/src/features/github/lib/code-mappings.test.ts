import { describe, expect, it } from 'vitest';
import { savableMappings } from './code-mappings';

describe('savableMappings', () => {
  it('keeps a mapping with an empty stack root, which prefixes every path', () => {
    const prefixAll = { stack_root: '', source_root: 'src/' };

    expect(savableMappings([prefixAll])).toEqual([prefixAll]);
  });

  it('drops a row left entirely empty', () => {
    const kept = { stack_root: '/app/', source_root: '' };

    expect(
      savableMappings([kept, { stack_root: '', source_root: '' }]),
    ).toEqual([kept]);
  });
});
