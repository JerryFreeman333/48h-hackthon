import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalize, hashInputObject, sha256Hex } from '../application/hash.js';

describe('canonical JSON 与输入哈希（规格 §13 幂等基础）', () => {
  it('键排序：不同键序产生同一 canonical 形式', () => {
    assert.strictEqual(canonicalize({ b: 1, a: 2 }), canonicalize({ a: 2, b: 1 }));
  });

  it('数组顺序保留（数组顺序本身是语义）', () => {
    assert.notStrictEqual(canonicalize([1, 2]), canonicalize([2, 1]));
    assert.strictEqual(canonicalize({ list: [1, 2] }), '{"list":[1,2]}');
  });

  it('拒绝非有限数字', () => {
    assert.throws(() => canonicalize(Number.NaN));
    assert.throws(() => canonicalize({ x: Number.POSITIVE_INFINITY }));
  });

  it('null 与嵌套结构', () => {
    assert.strictEqual(canonicalize(null), 'null');
    assert.strictEqual(canonicalize({ a: null, b: 'x' }), '{"a":null,"b":"x"}');
  });

  it('hashInputObject 确定且按对象名区分', () => {
    const value = { a: 1 };
    assert.strictEqual(hashInputObject('profile', value), hashInputObject('profile', { a: 1 }));
    assert.notStrictEqual(hashInputObject('profile', value), hashInputObject('bundle', value));
    assert.match(hashInputObject('profile', value), /^[0-9a-f]{64}$/);
  });

  it('sha256Hex 与已知向量一致', () => {
    // sha256("abc") 的标准测试向量。
    assert.strictEqual(
      sha256Hex('abc'),
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
