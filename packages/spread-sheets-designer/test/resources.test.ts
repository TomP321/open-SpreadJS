/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import { getResources, setResources, resolveText, mergeResources } from '../src/resolve.js';
import { englishResources } from '../src/resources.js';

describe('resources and themes', () => {
  it('resolves nested resource placeholders', () => {
    expect(resolveText('${res.ribbon.home.bold}', englishResources)).toBe('Bold');
    expect(resolveText('${res.ribbon.home.missing}', englishResources)).toBe('');
  });
  it('merges custom resources without dropping defaults', () => {
    const merged = mergeResources({ a: { b: 'one', c: 'two' } }, { a: { b: 'changed' } });
    expect(merged).toEqual({ a: { b: 'changed', c: 'two' } });
  });
  it('exposes mutable resources through setResources', () => {
    setResources({ title: 'Custom Designer' });
    expect(getResources().title).toBe('Custom Designer');
    expect((getResources().ribbon as any).home.bold).toBe('Bold');
  });
});
