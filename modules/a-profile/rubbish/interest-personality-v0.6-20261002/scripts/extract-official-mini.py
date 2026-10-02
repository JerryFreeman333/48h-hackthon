"""Extract verbatim items from the downloaded official 2016 Mini-IP PDF.
Research import only; requires pypdf. Never generates or translates item text.
"""
import hashlib
import json
import re
from pathlib import Path
from pypdf import PdfReader

root = Path(__file__).resolve().parents[1]
pdf = root / 'mini-ip-source.pdf'
reader = PdfReader(pdf)
items = []
for index in (17, 18):
    text = reader.pages[index].extract_text()
    for section in re.finditer(r'(Realistic|Investigative|Artistic|Social|Enterprising|Conventional) Items\s+Item # Content\s+(.*?)(?=\n\s*(?:Realistic|Investigative|Artistic|Social|Enterprising|Conventional) Items|\n\s*Note\.|\Z)', text, re.S):
        dimension = section[1].lower()
        for item in re.finditer(r'(?:^|\n)\s*(\d+)\s+(.+?)(?=\n\s*\d+\s+|\Z)', section[2], re.S):
            n = int(item[1])
            original = re.sub(r'\s+', ' ', item[2]).strip()
            items.append({'id': f'mini-{n:02}', 'itemNumber': n, 'originalText': original, 'dimension': dimension,
                          'sourcePage': {'printedPage': index + 2, 'pdfPage': index + 1}})
assert len(items) == 30 and sorted(x['itemNumber'] for x in items) == list(range(1, 31))
result = {'instrument': 'onet-mini-ip', 'version': '2016-computerized-en', 'language': 'en',
          'source': 'https://www.onetcenter.org/dl_files/Mini-IP.pdf',
          'sourceSHA256': hashlib.sha256(pdf.read_bytes()).hexdigest(),
          'items': sorted(items, key=lambda x: x['itemNumber'])}
target = root / 'src/instruments/onet-mini-ip.json'
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('Extracted 30 official English items; no translation. SHA256:', result['sourceSHA256'])
