/**
 * 已确认硬约束偏好的提取与类型检查（规格 §7）。
 *
 * 只执行 confirmed=true 且 strength=hard 的偏好；soft/unknown 不进入硬判定，
 * SearchIntent.filters/cities 不自动新增 UserProfile 的 hard。
 * 重复 hard key、错误类型、非法金额、非有限数字先拒绝，不由模型猜测。
 */
import type { UserProfile } from './contract.js';
import { cError, type CError } from './errors.js';

export type HardCityValue = { kind: 'city'; value: string[] };
export type HardSalaryThresholdValue = { kind: 'min_fixed_monthly_salary'; value: number };
export type HardBooleanValue = { kind: 'accept_sales_kpi' | 'accept_travel' | 'accept_outsourcing'; value: boolean };
export type HardUnregisteredValue = { kind: 'unregistered'; key: string; value: string | number | boolean | string[] | null };

export type HardPreference =
  | HardCityValue
  | HardSalaryThresholdValue
  | HardBooleanValue
  | HardUnregisteredValue;

export interface HardPreferenceEntry {
  /** 画像中的来源路径，用于 C 私有 DecisionTrace，不对外充当 B 事实（规格 §7.4）。 */
  profilePath: string;
  pref: HardPreference;
}

const REGISTERED_BOOLEAN_KEYS = new Set(['accept_sales_kpi', 'accept_travel', 'accept_outsourcing']);

function isNonEmptyStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === 'string' && item.length > 0)
  );
}

export function extractConfirmedHardPreferences(
  profile: UserProfile,
): { ok: true; value: HardPreferenceEntry[] } | { ok: false; error: CError } {
  const entries: HardPreferenceEntry[] = [];
  const seenHardKeys = new Map<string, string>();

  for (let index = 0; index < profile.preferences.length; index += 1) {
    const pref = profile.preferences[index];
    if (pref === undefined) {
      continue;
    }
    if (!(pref.strength === 'hard' && pref.confirmed === true)) {
      continue;
    }
    const profilePath = `preferences[${index}].key=${pref.key}`;
    const previous = seenHardKeys.get(pref.key);
    if (previous !== undefined) {
      return {
        ok: false,
        error: cError('DUPLICATE_HARD_KEY', `已确认硬约束 key 重复：${pref.key}（位于 ${previous} 与 ${profilePath}）`, {
          key: pref.key,
          firstPath: previous,
          secondPath: profilePath,
        }),
      };
    }
    seenHardKeys.set(pref.key, profilePath);

    if (pref.key === 'city') {
      const value = pref.value;
      if (typeof value === 'string') {
        if (value.length === 0) {
          return { ok: false, error: cError('PREFERENCE_INVALID', 'city 硬约束的值不能是空字符串', { key: pref.key }) };
        }
        entries.push({ profilePath, pref: { kind: 'city', value: [value] } });
        continue;
      }
      if (isNonEmptyStringArray(value)) {
        entries.push({ profilePath, pref: { kind: 'city', value } });
        continue;
      }
      return {
        ok: false,
        error: cError('PREFERENCE_INVALID', 'city 硬约束必须是城市字符串或非空字符串数组', {
          key: pref.key,
          profilePath,
        }),
      };
    }

    if (pref.key === 'min_fixed_monthly_salary') {
      if (typeof pref.value === 'number' && Number.isFinite(pref.value) && pref.value >= 0) {
        entries.push({ profilePath, pref: { kind: 'min_fixed_monthly_salary', value: pref.value } });
        continue;
      }
      return {
        ok: false,
        error: cError('PREFERENCE_INVALID', 'min_fixed_monthly_salary 硬约束必须是非负有穷数字', {
          key: pref.key,
          profilePath,
        }),
      };
    }

    if (REGISTERED_BOOLEAN_KEYS.has(pref.key)) {
      if (typeof pref.value === 'boolean') {
        const booleanKey = pref.key as HardBooleanValue['kind'];
        entries.push({ profilePath, pref: { kind: booleanKey, value: pref.value } });
        continue;
      }
      return {
        ok: false,
        error: cError('PREFERENCE_INVALID', `${pref.key} 硬约束必须是布尔值`, {
          key: pref.key,
          profilePath,
        }),
      };
    }

    // 未登记 key：不用于确定性结论，保留为 unknown 约束条目（规格 §6）。
    entries.push({ profilePath, pref: { kind: 'unregistered', key: pref.key, value: pref.value } });
  }

  return { ok: true, value: entries };
}

/** soft/unknown 偏好列表：逐项解释用，不参与硬判定。 */
export function collectNonHardPreferences(profile: UserProfile): { profilePath: string; key: string; value: UserProfile['preferences'][number]['value']; strength: string }[] {
  const result: { profilePath: string; key: string; value: UserProfile['preferences'][number]['value']; strength: string }[] = [];
  for (let index = 0; index < profile.preferences.length; index += 1) {
    const pref = profile.preferences[index];
    if (pref === undefined) {
      continue;
    }
    if (pref.strength === 'hard' && pref.confirmed) {
      continue;
    }
    result.push({
      profilePath: `preferences[${index}].key=${pref.key}`,
      key: pref.key,
      value: pref.value,
      strength: pref.strength,
    });
  }
  return result;
}
