import { describe, expect, it } from 'vitest';
import { canonicalize, hashInputObject, sha256Hex } from '../application/hash.js';

describe('canonical JSON 与输入哈希（规格 §13 幂等基础）', () => {
  it('键排序：不同键序产生同一 canonical 形式', () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }));
  });

  it('数组顺序保留（数组顺序本身是语义）', () => {
    expect(canonicalize([1, 2])).not.toBe(canonicalize([2, 1]));
    expect(canonicalize({ list: [1, 2] })).toBe('{"list":[1,2]}');
  });

  it('拒绝非有限数字', () => {
    expect(() => canonicalize(Number.NaN)).toThrow();
    expect(() => canonicalize({ x: Number.POSITIVE_INFINITY })).toThrow();
  });

  it('null 与嵌套结构', () => {
    expect(canonicalize(null)).toBe('null');
    expect(canonicalize({ a: null, b: 'x' })).toBe('{"a":null,"b":"x"}');
  });

  it('hashInputObject 确定且按对象名区分', () => {
    const value = { a: 1 };
    expect(hashInputObject('profile', value)).toBe(hashInputObject('profile', { a: 1 }));
    expect(hashInputObject('profile', value)).not.toBe(hashInputObject('bundle', value));
    expect(hashInputObject('profile', value)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('sha256Hex 与已知向量一致', () => {
    // sha256("abc") 的标准测试向量。
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
