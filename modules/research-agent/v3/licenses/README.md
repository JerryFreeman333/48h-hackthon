# V3 本地文档解析采用与许可证

2026-10-10 实际安装并运行；不包含平台爬虫、音视频或外部 OCR 服务。安装入口为 `../../requirements-v3-lock.txt`，包含原 V2 冻结依赖。模型保留在本地 Python 环境，未提交模型或用户材料。

| 组件与固定版本 | 实际采用内容 | 许可证及上游 |
| --- | --- | --- |
| python-docx 1.2.0 | DOCX 主文档段落、表格行与单元格解析 | MIT，[官方仓库](https://github.com/python-openxml/python-docx)；安装包完整许可证保存在 `dependencies/python-docx/` |
| openpyxl 3.1.5 | XLSX 只读解析，工作表/单元格定位；保留公式文本，绝不计算公式、请求外链 | MIT，[官方文档](https://openpyxl.readthedocs.io/en/stable/)；`dependencies/openpyxl/` |
| RapidOCR ONNX Runtime 1.4.4 | PNG/JPEG 与主动导入扫描 PDF 的本地 CPU 中文 OCR；几何框、物理页、识别置信度 | Apache-2.0，[固定 v1.4.4 源码](https://github.com/RapidAI/RapidOCR/tree/86ae3f5079df3422c1829cd84baf19bc8a7a9453)，完整上游许可 `RapidOCR-Apache-2.0.txt` |
| ONNX Runtime 1.31.0 | CPU 推理；不启用 GPU 或远程服务 | MIT，[官方仓库](https://github.com/microsoft/onnxruntime)；`dependencies/onnxruntime/` |

RapidOCR wheel 已包含 PP-OCRv4 中文检测/识别模型以及 `ch_ppocr_mobile_v2.0_cls` 方向模型。上游模型由 PaddleOCR 提供，其项目采用 Apache-2.0，许可副本为 `PaddleOCR-Apache-2.0.txt`。RapidOCR 固定版本 README 说明其模型转换来源于 PaddleOCR；这里记录的是 PyPI wheel 实际模型哈希，不把转换后的 ONNX 文件说成与上游权重字节相同。当前 RapidOCR 模型许可证说明只列举新版本的默认模型，因此没有用它替代本版本的出处记录。[PaddleOCR 官方项目许可](https://github.com/PaddlePaddle/PaddleOCR/blob/release/2.7/LICENSE)。

`dependency-manifest.json` 记录 17 个新直接或间接依赖的实际版本、许可证元数据、完整许可文件位置/哈希，以及 3 个已安装 ONNX 文件的尺寸和哈希。原 V2 的 Pillow、pypdfium2、pdfplumber 等许可继续保存在 `../../v2/licenses/`。依赖许可不是全部 MIT/Apache：NumPy、Shapely、lxml 等采用 BSD，tqdm 元数据为 MPL-2.0 AND MIT，OpenCV wheel 另含第三方许可；这里保留安装包提供的完整声明。没有修改或移植这些项目的内部源码。

本次验证只使用明确标记的合成中文材料：DOCX、XLSX、CSV、PNG 与单页扫描 PDF，识别到公司全名和 18000 工资字符串。它验证解析链条，不代表真实企业承诺，也不能推导中文平台识别准确率。OCR 结果全部标为需要复核的来源陈述，不认证图片真实性。

限制：主动导入原件最大 18 MB；OOXML 全部解压尺寸 60 MB、1200 条目、单条 15 MB、最大 200 倍展开；拒绝宏、嵌入对象、XML 实体、加密/路径穿越 ZIP。工作表最大 24 个、单表 5000 行/128 列、总 25000 单元格；OCR 最大 12 页、1600 万像素，子进程时间默认 25 秒/硬上限 35 秒且服从当前问题剩余时间。OCR 全程使用明确安装在本地的模型路径，未使用付费接口，运行时不下载模型。

DOCX 未重建 Word 排版页码，也不自动解析页眉页脚、批注或嵌入图片；XLSX 不推断显示格式、不读取外链、不计算公式；图像边界框单位为原图像素，扫描 PDF 边界框为 2 倍渲染像素。当前不支持旧二进制 DOC/XLS、PPT、GIF、手写准确率或 OCR 表格网格重建。这些情况保留明确限制，不捏造定位或单元格。
