"""
Layer 1: deterministic 抽取（不调 LLM）。

三个 extractor：
    - SalaryExtractor:  数字 + 单位 + 月/年/税前/税后/含绩效 → 候选
    - HoursExtractor:   "9-10点下班" "大小周" "996" "995" → 候选
    - SentimentScorer:  cnsenti 或 jieba + 词典打分

每个 extractor 输出：
    candidate = {
        "text_match": str (≤40 char),
        "value":      str,
        "dimension":  "B1.hours"|"B2.salary"|...,
        "polarity":   "pos"|"neg"|"neutral",
        "weight":     float (1.0 default),
    }

不做任何 LLM 调用；只给 evidence 评级 fact_value = candidate
"""
from __future__ import annotations

import re
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Iterable


@dataclass
class Candidate:
    text_match: str
    value: str
    dimension: str   # 'B1.hours'|'B2.salary'|'B3.culture'|'B4.promotion'
    polarity: str    # 'pos'|'neg'|'neutral'|'mixed'
    weight: float = 1.0


# === Salary ============================================================

# 常见月薪写法
SALARY_PATTERNS = [
    # === 原始 5 个模式 ===
    # "30k", "30K", "30K/月"
    (r'(\d{1,3}(?:\.\d)?)\s*[kK]\b', lambda m: f"{m.group(1)}k/月"),
    # "月薪 3 万", "月薪3万"
    (r'月薪\s*(\d{1,3}(?:\.\d)?)\s*万', lambda m: f"{m.group(1)}万/月"),
    # "30k*16 薪" "30K 16薪"
    (r'(\d{1,3}(?:\.\d)?)\s*[kK]\s*[xX×]?(\d{1,2})\s*薪', lambda m: f"{m.group(1)}k/m × {m.group(2)}薪"),
    # "12000-18000元/月"
    (r'(\d{4,6})[-—~](\d{4,6})\s*元/?月?', lambda m: f"{m.group(1)}-{m.group(2)}元/月"),
    # "1.5w" "2W" — 万为单位（通常是月薪或 offer base）
    (r'(\d{1,2}\.\d{1,2})\s*[wW万]\b', lambda m: f"{m.group(1)}万"),

    # === 新增（Gap B 修复）：区间表达 ===
    # "30-50k" / "30k-50k" / "30K~50K" / "30k到50k" / "20k+" — K 区间
    (r'(\d{1,3}(?:\.\d)?)\s*[kK]\s*[-—~到]+\s*(\d{1,3}(?:\.\d)?)\s*[kK]', lambda m: f"{m.group(1)}-{m.group(2)}k/月"),
    # "6K-7K" "3K-30K" — 仅 K 区间（简写）
    (r'[¥￥$]?\s*(\d{1,3}(?:\.\d)?)\s*[kK]\s*[-—~]\s*(\d{1,3}(?:\.\d)?)\s*[kK]', lambda m: f"{m.group(1)}-{m.group(2)}k/月"),
    # "20k+" / "30K+" — 半开
    (r'(\d{1,3}(?:\.\d)?)\s*[kK]\s*\+', lambda m: f"{m.group(1)}k+/月"),
    # "￥30k" "$30K" — ¥前缀
    (r'[¥￥]\s*(\d{1,3}(?:\.\d)?)\s*[kK]', lambda m: f"{m.group(1)}k/月"),

    # === 新增：万元区间 ===
    # "30万至60万" / "30万到60万" / "8-12 万元" — 万区间（年薪常见）
    (r'(\d{1,3}(?:\.\d)?)\s*万\s*[至到~\-—]+\s*(\d{1,3}(?:\.\d)?)\s*万', lambda m: f"{m.group(1)}-{m.group(2)}万/年"),
    # "年薪 30 万" / "年薪30万"
    (r'年薪\s*(?:约\s*)?(\d{1,3}(?:\.\d)?)\s*万', lambda m: f"{m.group(1)}万/年"),
    # "8-12 万元" / "8-12万" — 数字区间 万元
    (r'(\d{1,3}(?:\.\d)?)\s*[-—~至到]\s*(\d{1,3}(?:\.\d)?)\s*万\s*元?', lambda m: f"{m.group(1)}-{m.group(2)}万/年"),
    # "月薪 5000元" / "月入 10000元"
    (r'(?:月薪|月入|月工资)\s*(?:约\s*)?(\d{3,6})\s*元', lambda m: f"{m.group(1)}元/月"),
    # "5000元至15000元" / "3000元到1.5万" — 元区间
    (r'(\d{3,6})\s*元\s*[至到~\-—]+\s*(\d{3,6})\s*元', lambda m: f"{m.group(1)}-{m.group(2)}元/月"),
    # "月入过万" — 模糊高表达
    (r'月入\s*过\s*万', lambda m: "月入过万"),
    (r'年薪\s*20\s*万\s*\+', lambda m: "年薪20万+"),

    # === 新增：福利信号（B2 间接证据）===
    # "带薪假" "全薪旅行假" "3天全薪"
    (r'(\d+)\s*个?\s*工作?\s*日?\s*[的]?\s*全薪', lambda m: f"{m.group(1)}天全薪假"),
    (r'带薪\s*年假', lambda m: "带薪年假"),
    (r'陪护假', lambda m: "陪护假"),
    (r'育儿假', lambda m: "育儿假"),
    (r'人才公寓', lambda m: "人才公寓"),
    (r'住房保障', lambda m: "住房保障"),
    (r'六险一金', lambda m: "六险一金"),
    (r'五险一金', lambda m: "五险一金"),
    (r'补充医疗保险', lambda m: "补充医保"),
    (r'餐补', lambda m: "餐补"),
    (r'房补', lambda m: "房补"),
    (r'交通补贴', lambda m: "交通补贴"),
    (r'股票期权', lambda m: "股票期权"),
    (r'限制性股票', lambda m: "限制性股票"),
    (r'RSU', lambda m: "RSU"),
]

# 口径关键词
SALARY_BASIS_TOKENS = {
    "fixed": ["固定", "base", "底薪"],
    "total": ["综合", "含绩效", "含年终", "total"],
    "税前": ["税前", "pre-tax", "before tax"],
    "税后": ["税后", "after tax", "到手"],
}


class SalaryExtractor:
    dimension = "B2.salary"

    def extract(self, text: str) -> list[Candidate]:
        out = []
        for pat, formatter in SALARY_PATTERNS:
            for m in re.finditer(pat, text):
                value = formatter(m)
                start = max(0, m.start() - 8)
                end = min(len(text), m.end() + 12)
                ctx = text[start:end]
                basis = _detect_basis(text, m.start(), m.end())
                if basis:
                    value = f"{value} ({basis})"
                out.append(Candidate(
                    text_match=ctx,
                    value=value,
                    dimension=self.dimension,
                    polarity="neutral",  # 薪资数字本身无极性
                    weight=1.0,
                ))
        return out


def _detect_basis(text: str, start: int, end: int) -> str | None:
    window = text[max(0, start - 20): min(len(text), end + 20)]
    for basis, tokens in SALARY_BASIS_TOKENS.items():
        if any(tok in window for tok in tokens):
            return basis
    return None


# === Hours =============================================================

HOURS_NEGATIVE_PATTERNS = [
    # "996", "995", "大小周", "加班" 等
    # (?<!\d)/(?!\d) 数字边界：防止把 1996/1995/1952 等年份数字误判成工时
    # （主库实测该缺陷产生了 ~7400 条假 B1 事实，2026-10-03 修复）
    (r'(?<!\d)9\s*9\s*6(?!\d)', "996"),
    (r'(?<!\d)9\s*9\s*5(?!\d)', "995"),
    (r'(?<!\d)9\s*[-—~到至]\s*5(?!\d)', "9-5"),  # 真 9-5（原模式只能命中"95"数字串）
    (r'大小周', "大小周"),
    (r'大小休', "大小休"),
    (r'单休', "单休"),
    (r'双休', "双休"),
    (r'弹性.{0,3}工作', "弹性工作"),
    (r'加班', "加班"),
    (r'OT\b', "加班"),
    (r'(\d{1,2})\s*[-到─~]\s*(\d{1,2})\s*点下班', "explicit_off_time"),
    (r'周末加班', "周末加班"),
    (r'晚上\s*(\d{1,2})\s*点下班', "explicit_off_time"),
]


class HoursExtractor:
    dimension = "B1.hours"

    def extract(self, text: str) -> list[Candidate]:
        out = []
        for pat, label in HOURS_NEGATIVE_PATTERNS:
            for m in re.finditer(pat, text):
                start = max(0, m.start() - 6)
                end = min(len(text), m.end() + 6)
                ctx = text[start:end]
                # 极性判断
                neg_words = ["辛苦", "累", "加班多", "压力大", "吐槽"]
                pos_words = ["不加班", "准时下班", "双休", "弹性", "work life balance"]
                pol = "neutral"
                win = text[max(0, m.start() - 30): min(len(text), m.end() + 30)]
                if any(w in win for w in neg_words):
                    pol = "neg"
                elif any(w in win for w in pos_words):
                    pol = "pos"
                if callable(label):
                    value = label(m)
                else:
                    value = label
                out.append(Candidate(
                    text_match=ctx,
                    value=value,
                    dimension=self.dimension,
                    polarity=pol,
                    weight=1.0,
                ))
        return out


# === Sentiment ========================================================

# 不依赖外部词典；自维护小词典（来自 funNLP/情感词汇本体）
SENTI_POS = {
    "好", "不错", "棒", "优秀", "尊重", "氛围好", "nice", "推荐", "福利好",
    "学到", "成长", "晋升", "培养", "晋升空间", "稳定", "work life balance",
    "wlb", "955", "965", "准时下班", "人文关怀", "弹性", "尊重",
}
SENTI_NEG = {
    "累", "加班多", "压力大", "血汗", "坑", "劝退", "跑路", "裁员", "辞退",
    "n+1", "被迫", "压榨", "甩锅", "朝令夕改", "螺丝钉", "无成长", "降本增效",
    "35岁危机", "pua", "无语", "烂", "差", "差劲", "恶心", "受不了", "不建议",
    "流动率高", "事故", "加班文化", "大小周", "单休", "996", "995",
}


class SentimentScorer:
    """极简情感打分；cnsenti 可选装，做精细版。"""
    dimension = "B3.culture"

    def __init__(self, use_cnsenti: bool = False):
        self.use_cnsenti = use_cnsenti
        self._engine = None
        if use_cnsenti:
            try:
                from cnsenti import Sentiment
                self._engine = Sentiment()
            except ImportError:
                self.use_cnsenti = False

    def score(self, text: str) -> tuple[float, str]:
        if self.use_cnsenti and self._engine is not None:
            try:
                res = self._engine.sentiment_count(text)
                pos = float(res.get("pos", 0))
                neg = float(res.get("neg", 0))
                total = pos + neg
                if total < 3:
                    return 0.0, "neutral"  # 样本不足
                polarity = pos / total
                if polarity > 0.6:
                    return polarity, "pos"
                if polarity < 0.4:
                    return 1 - polarity, "neg"
                return 0.5, "mixed"
            except Exception:
                pass
        # 兜底：词典计数
        pos_n = sum(1 for w in SENTI_POS if w in text)
        neg_n = sum(1 for w in SENTI_NEG if w in text)
        total = pos_n + neg_n
        if total < 2:
            return 0.0, "neutral"
        pol = pos_n / total
        if pol > 0.6:
            return pol, "pos"
        if pol < 0.4:
            return 1 - pol, "neg"
        return 0.5, "mixed"

    def extract(self, text: str) -> Candidate | None:
        score, polarity = self.score(text)
        if polarity == "neutral" or score == 0.0:
            return None
        return Candidate(
            text_match=text[:60],
            value=f"{polarity}:{score:.2f}",
            dimension=self.dimension,
            polarity=polarity,
            weight=min(1.0, score),
        )


# === Promotion ========================================================

PROMO_PATTERNS = [
    # 阿里/字节系术语
    (r'P\s*[0-9]\s*[\+\-到]', "P级晋升"),
    (r'P\s*序列', "P序列"),
    (r'M\s*[0-9]?\s*[\+\-到]', "M级晋升"),
    (r'M\s*序列', "M序列"),
    (r'PCM\s*评估', "PCM晋升评估"),
    (r'校招.{0,4}晋升', "校招晋升"),
    # 一般公司术语
    (r'晋升.{0,4}周期', "晋升周期"),
    (r'晋升.{0,4}评估', "晋升评估"),
    (r'晋升.{0,4}答辩', "晋升答辩"),
    (r'晋升.{0,4}通道', "晋升通道"),
    (r'职级.{0,4}晋升', "职级晋升"),
    (r'升职.{0,3}通道', "升职通道"),
    (r'调级', "调级"),
    (r'提级', "提级"),
    (r'职级.{0,3}评审', "职级评审"),
    (r'晋升.{0,4}透明', "晋升透明"),
    (r'晋升.{0,4}不透明', "晋升不透明"),
    (r'晋升.{0,4}困难', "晋升困难"),
    # 培养机制
    (r'带教', "带教"),
    (r'内部.{0,3}转岗', "内转"),
    (r'管培生', "管培"),
    # 负面信号
    (r'无上升.{0,3}空间', "无上升空间"),
    (r'晋升.{0,4}看不到', "看不到晋升"),
    (r'涨薪.{0,3}难', "涨薪难"),

    # === 新增（Gap B 修复）：薪酬激励 / 涨薪信号 ===
    # "13薪" / "14薪" / "15薪" / "16薪" / "N薪"
    (r'(\d{1,2})\s*薪', lambda mm: f"{mm.group(1)}薪"),
    (r'年终奖', "年终奖"),
    (r'年终\s*奖?金?', "年终奖"),
    (r'年底.{0,5}双薪', "年底双薪"),
    (r'年底.{0,5}三薪', "年底三薪"),
    # 涨薪 / 调薪 / 加薪 信号
    (r'涨薪', "涨薪"),
    (r'加薪', "加薪"),
    (r'调薪', "调薪"),
    (r'全员涨薪', "全员涨薪"),
    # 股权激励
    (r'股票\s*期权', "股票期权"),
    (r'期权\s*激励', "期权激励"),
    (r'限制性\s*股票', "限制性股票"),
    (r'RSU', "RSU"),
    (r'股权\s*激励', "股权激励"),
    # 公司增长信号（HC / 招聘）
    (r'扩招', "扩张招聘"),
    (r'缩招', "收缩招聘"),
    (r'裁员', "裁员信号"),
    (r'HC.{0,3}扩', "HC扩张"),
    (r'headcount', "headcount"),
    (r'涨薪.{0,3}幅度', "涨薪幅度"),
    (r'年度调薪', "年度调薪"),
    (r'半年度调薪', "半年度调薪"),
    (r'季度调薪', "季度调薪"),
    (r'绩效.{0,3}调薪', "绩效调薪"),
    (r'晋升.{0,4}通道.{0,4}清晰', "晋升通道清晰"),
    (r'晋升.{0,4}加薪.{0,4}同步', "晋升加薪同步"),
    (r'涨薪.{0,4}30%', "涨薪30%"),
    (r'涨薪.{0,4}50%', "涨薪50%"),
]


class PromotionExtractor:
    dimension = "B4.promotion"

    def extract(self, text: str) -> list[Candidate]:
        out = []
        for pat, label in PROMO_PATTERNS:
            for m in re.finditer(pat, text):
                start = max(0, m.start() - 6)
                end = min(len(text), m.end() + 6)
                ctx = text[start:end]
                neg = "不透明" in ctx or "困难" in ctx or "无" in ctx
                pos = "涨薪" in ctx or "年终" in ctx or "股票" in ctx or "期权" in ctx or "调薪" in ctx or "年度调薪" in ctx
                if pos and not neg:
                    pol = "pos"
                elif neg:
                    pol = "neg"
                else:
                    pol = "neutral"
                if callable(label):
                    value = label(m)
                else:
                    value = label
                out.append(Candidate(
                    text_match=ctx,
                    value=value,
                    dimension=self.dimension,
                    polarity=pol,
                    weight=1.0,
                ))
        return out


# === 顶层 run =======================================================

def extract_all(text: str) -> list[Candidate]:
    """跑全部 extractor，合并去重。"""
    se = SalaryExtractor()
    he = HoursExtractor()
    ss = SentimentScorer(use_cnsenti=True)
    pe = PromotionExtractor()
    out: list[Candidate] = []
    out.extend(se.extract(text))
    out.extend(he.extract(text))
    sent = ss.extract(text)
    if sent:
        out.append(sent)
    out.extend(pe.extract(text))
    return out


if __name__ == "__main__":
    samples = [
        "在字节加班到晚上10点是常态。",
        "给到30k*16薪，但是 base 30k 加 5% 每年，签字费自理",
        "团队氛围好，但是加班多，996 大小周，",
        "晋升透明，半年一次晋升评估",
    ]
    for s in samples:
        print(f">>> {s}")
        for c in extract_all(s):
            print(f"   {c.dimension:14s} {c.polarity:7s} {c.value:30s} '{c.text_match}'")
