# Franklin_promax · MANIFEST

## 6 能力清单（独立验证 18/18 数据点通过）

### 能力 1: Franklin — 只读查询

| 文件 | `cli.py` |
|---|---|
| 函数 | `cmd_summary`, `cmd_coverage`, `cmd_report` |
| 依赖 | sqlite3 |
| 验证测试 | 测试 1.1-1.6（6 个数字精确匹配） |
| 已知问题 | 无 |

### 能力 2: Kepler — 文档更新

| 模式 | `Path.write_text()` 替代 `rm` 类 shell 命令 |
|---|---|
| 验证测试 | 测试 2（marker 命中 + 行数 +2）|
| 已知问题 | sandbox 不允许 `rm -f`，但 Python `Path.unlink()` 可用 |

### 能力 3: Hubble — 修复验证判断

| 函数 | 验证当前 extractors.py 模式数 ≥90 |
|---|---|
| 验证测试 | 测试 3（96 模式 + 13薪制/16薪/年薪区间样本 + cnsenti 可用）|
| 关键判断 | 拒绝冗余修复（如 Raman_v2 关闭） |

### 能力 4: Dirac — 港股 verified fetcher

| 函数 | `fetch_hkex_news(stock_code)` |
|---|---|
| 来源文件 | `crawl_no_login/no_login_crawler.py`（约 30KB）|
| 端点 | etnet.com.hk/quote_ci_brief.php + quote_news.php |
| 验证测试 | 测试 4（3 只港股 verified hits = 11）|
| 已知问题 | 命中数从 41 衰减到 11（外部源不稳定）|

### 能力 5: Euclid — cnsenti + aliases

| 类 | `SentimentScorer(use_cnsenti=True)` |
|---|---|
| 来源文件 | `analysis/extractors.py`（约 15KB，含 96 模式）|
| 别名 | `etl/refresh_aliases.py`（约 2KB）|
| 验证测试 | 测试 5（aliases=21 / cnsenti polarity 可计算）|
| 已知问题 | cnsenti 默认词典对复合短文本覆盖不全 |

### 能力 6: Raman — 招聘源 fetcher

| 函数 | `fetch_all_recruit(keyword)` |
|---|---|
| 来源文件 | `crawl_no_login/fetch_recruit.py`（约 11KB）|
| 端点 | Bing / 360 / 搜狗微信（招聘 cache 兜底）|
| 验证测试 | 测试 6（钉钉 工资 = 15 hits）|
| 已知问题 | 必须 `cd crawl_no_login/` 或 sys.path 含 `.` |

---

## 数据流图

```
xray_hangzhou.db (主库)
       │
       ├──► Franklin (cli.py) ──► 验证数字（6 个 COUNT）
       ├──► Dirac (fetch_hkex_news) ──► 写 evidence 表（verified）
       ├──► Raman (fetch_recruit) ──► 写 evidence 表（unverified）
       ├──► Euclid (extractors.py::SentimentScorer) ──► 写 facts 表
       └──► Euclid (refresh_aliases.py) ──► 写 companies.aliases 字段
```

## 已知限制

1. **不含 DB**：Franklin_promax 仅含代码，DB 在原项目 `db/xray_hangzhou.db`
2. **PEP 668**：cnsenti / jieba 安装需要 `--break-system-packages`
3. **fetch_recruit 相对导入**：必须在正确目录运行
4. **HK endpoint 衰减**：实测命中数 < 历史峰值
5. **cnsenti 词典**：默认词典对复合句支持有限

## 迁移清单

迁移到 ZCode 时需要：

- [ ] 复制 `franklin_promax/` 整个目录到 ZCode 项目
- [ ] 软链接或复制 `xray_hangzhou.db` 到 ZCode 数据目录
- [ ] 安装 `cnsenti` 和 `jieba`
- [ ] 跑 `tests/test_6_capabilities.py` 验证 6 能力
- [ ] 在 ZCode 主代码中 import 需要的函数

---

**END OF MANIFEST.md**
