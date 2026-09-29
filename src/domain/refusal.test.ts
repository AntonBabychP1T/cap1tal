import { describe, expect, it } from 'vitest';

import { isRefusal, Refusal } from './refusal';

describe('Refusal', () => {
  it('is an Error that says exactly what it was given', () => {
    const refusal = new Refusal('оберіть рахунок');

    expect(refusal).toBeInstanceOf(Error);
    expect(refusal.message).toBe('оберіть рахунок');
    expect(isRefusal(refusal)).toBe(true);
  });

  it('tells a refusal from a failure', () => {
    // A thrown Error is the app breaking — SQLite, a native module, a bug — and stays a failure.
    expect(isRefusal(new Error('database is locked'))).toBe(false);
    expect(isRefusal(new TypeError('x is undefined'))).toBe(false);
    expect(isRefusal('оберіть рахунок')).toBe(false);
    expect(isRefusal(undefined)).toBe(false);
  });

  it('is recognised by its name too, should a transpiled subclass lose its prototype', () => {
    // Belt and braces for `class … extends Error` under a transpiler that does not wrap native
    // supers: the name is set in the constructor, so it survives either way.
    const lookalike = Object.assign(new Error('назва не може бути порожньою'), { name: 'Refusal' });
    expect(isRefusal(lookalike)).toBe(true);
    expect(new Refusal('x').name).toBe('Refusal');
  });
});
