/**
 * canonical JSON 与输入哈希（规格 §13）：键排序、数组顺序保留、拒绝非有限值。
 * 幂等键作用域（所有者+项目+操作+幂等键）与 409 冲突在 P2 API 层落地。
 */
import { createHash } from 'node:crypto';

export function canonicalize(value: unknown): string {
  return serialize(value);
}

function serialize(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  switch (typeof value) {
    case 'string':
      return JSON.stringify(value);
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) {
        throw new Error('canonical JSON 拒绝非有限数字');
      }
      return JSON.stringify(value);
    case 'object': {
      if (Array.isArray(value)) {
        // 数组顺序保留：数组顺序本身是语义（如 preferences 的顺序）。
        return `[${value.map(serialize).join(',')}]`;
      }
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record).sort();
      return `{${keys.map((key) => `${JSON.stringify(key)}:${serialize(record[key])}`).join(',')}}`;
    }
    default:
      throw new Error(`canonical JSON 不支持的类型：${typeof value}`);
  }
}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function hashInputObject(name: 'profile' | 'intent' | 'bundle', value: unknown): string {
  return sha256Hex(`${name}\u0000${canonicalize(value)}`);
}
