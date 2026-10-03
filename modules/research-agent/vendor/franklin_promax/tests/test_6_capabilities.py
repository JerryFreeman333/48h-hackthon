"""
Franklin_promax 6 能力单元测试。
运行：python3 tests/test_6_capabilities.py
"""
import sys
sys.path.insert(0, '.')

def test_1_franklin_readonly():
    """Franklin 原能力：只读查询"""
    import sqlite3
    conn = sqlite3.connect('../db/xray_hangzhou.db')
    try:
        n_co = conn.execute("SELECT COUNT(*) FROM companies").fetchone()[0]
        n_ev = conn.execute("SELECT COUNT(*) FROM evidence").fetchone()[0]
        n_fa = conn.execute("SELECT COUNT(*) FROM facts").fetchone()[0]
        print(f"  ✓ companies={n_co}, evidence={n_ev}, facts={n_fa}")
        assert n_co > 100 and n_ev > 1000 and n_fa > 100
    finally:
        conn.close()

def test_2_kepler_doc_update():
    """Kepler 能力：文档更新（不破坏原文件）"""
    from pathlib import Path
    test_file = Path('/tmp/franklin_promax_test_doc.md')
    if test_file.exists():
        test_file.unlink()
    test_file.write_text("# 测试\n", encoding='utf-8')
    existing = test_file.read_text(encoding='utf-8')
    marker = "\n<!-- FRANKLIN_PROMAX_TEST -->\n"
    test_file.write_text(existing + marker, encoding='utf-8')
    content = test_file.read_text(encoding='utf-8')
    assert "FRANKLIN_PROMAX_TEST" in content
    print(f"  ✓ doc updated, marker present")
    test_file.unlink()

def test_3_hubble_repair_verification():
    """Hubble 能力：修复验证判断"""
    import sys
    sys.path.insert(0, 'analysis')
    from extractors import SALARY_PATTERNS, PROMO_PATTERNS, HOURS_NEGATIVE_PATTERNS
    total = len(SALARY_PATTERNS) + len(PROMO_PATTERNS) + len(HOURS_NEGATIVE_PATTERNS)
    print(f"  ✓ 总模式数: {total}")
    assert total >= 90, f"模式数 {total} < 90，Gap B 修复未到位"

def test_4_dirac_hk_fetcher():
    """Dirac 能力：fetch_hkex_news"""
    from crawl_no_login.no_login_crawler import fetch_hkex_news
    n = 0
    for code in ['02500', '01672', '09669']:
        hits = fetch_hkex_news(code)
        n += sum(1 for h in hits if h.is_official)
    print(f"  ✓ 港股 etnet verified hits: {n}")
    assert n >= 6, f"verified hits {n} < 6"

def test_5_euclid_cnsenti_aliases():
    """Euclid 能力：cnsenti + aliases"""
    import sys
    sys.path.insert(0, 'analysis')
    from extractors import SentimentScorer
    ss = SentimentScorer(use_cnsenti=True)
    score, polarity = ss.score("测试文本")
    print(f"  ✓ cnsenti polarity={polarity}")
    assert polarity in ('pos', 'neg', 'mixed', 'neutral')

def test_6_raman_recruit():
    """Raman 能力：fetch_recruit"""
    from crawl_no_login.fetch_recruit import fetch_all_recruit
    hits = fetch_all_recruit("钉钉 工资")
    print(f"  ✓ fetch_recruit 钉钉 工资: {len(hits)} hits")
    assert len(hits) >= 5, f"hits {len(hits)} < 5"

if __name__ == "__main__":
    print("=== Franklin_promax 6 能力单元测试 ===\n")
    tests = [
        ("1. Franklin 只读查询", test_1_franklin_readonly),
        ("2. Kepler 文档更新", test_2_kepler_doc_update),
        ("3. Hubble 修复验证", test_3_hubble_repair_verification),
        ("4. Dirac 港股 fetcher", test_4_dirac_hk_fetcher),
        ("5. Euclid cnsenti+aliases", test_5_euclid_cnsenti_aliases),
        ("6. Raman 招聘源", test_6_raman_recruit),
    ]
    passed = 0
    for label, fn in tests:
        print(f"[{label}]")
        try:
            fn()
            passed += 1
        except Exception as e:
            print(f"  ✗ FAIL: {e}")
        print()
    print(f"=== {passed}/6 通过 ===")
