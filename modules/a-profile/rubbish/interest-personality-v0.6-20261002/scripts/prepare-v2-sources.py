"""Rebuild artifacts mechanically from official files, never generate item text.
Requires openpyxl. Download inputs to .sources; see docs/V2_IMPLEMENTATION.md.
"""
from pathlib import Path
import re, html, json, hashlib, datetime
import openpyxl

ROOT = Path(__file__).resolve().parents[1]
def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def emit(p, value, compact=False):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(value, ensure_ascii=False, indent=None if compact else 2, separators=(',',':') if compact else None) + '\n', encoding='utf-8')
def clean(x): return ' '.join(html.unescape(re.sub('<[^>]+>', '', x)).split())

source = ROOT / '.sources/mini-ipip-key.html'
tables = re.findall(r'<table align="left".*?</table>', source.read_text(encoding='latin1'), re.S)
dimensions = ['extraversion','agreeableness','conscientiousness','neuroticism','intellect_imagination']
anchors = ['Extraversion','Agreeableness','Conscientiousness','Neuroticism','Intellect']
assert len(tables) == 5, 'Official HTML structure changed; review instead of guessing.'
items = []
for dim, anchor, table in zip(dimensions, anchors, tables):
    reverse, position = None, 0
    for row in re.findall(r'<tr>(.*?)</tr>', table, re.S):
        cells = [clean(c) for c in re.findall(r'<td[^>]*>(.*?)</td>', row, re.S)]
        if len(cells) != 2 or not cells[1]: continue
        if 'keyed' in cells[0]: reverse = not cells[0].startswith('+')
        assert reverse is not None
        position += 1
        items.append(dict(id=f'mipip-{len(items)+1:02}', originalItemId=f'official-key:{anchor}:{position}',
          originalText=cells[1], dimension=dim, reverseScored=reverse,
          source='https://ipip.ori.org/MiniIPIPKey.htm', sourceLocator=f'Factor {dim}; key row {position}',
          chineseText=None, translationStatus='not-translated', licenseStatus='public-domain'))
    assert position == 4
assert len(items) == 20 and sum(x['reverseScored'] for x in items if x['dimension']=='intellect_imagination') == 3
donor_path=ROOT/'.sources/donor-mini-ipip.yaml'
if donor_path.exists():
    donor_items={}
    for line in donor_path.read_text(encoding='utf-8').splitlines():
        identifier=re.search(r'id:\s*"([^"]+)"',line)
        prompt=re.search(r'prompt:\s*("(?:\\.|[^"\\])*")',line)
        if identifier and prompt: donor_items[json.loads(prompt[1])]=identifier[1]
    assert len(donor_items)==20 and all(i['originalText'] in donor_items for i in items), 'Do not guess donor correspondence'
    for item in items: item['donorItemId']=donor_items[item['originalText']]
emit(ROOT/'src/instruments/mini-ipip.json', dict(instrument='mini-ipip',version='2006-official-key-en-1',
  scoringVersion='ipip-sum-1',locale='en',source='https://ipip.ori.org/MiniIPIPKey.htm',sourceHash=digest(source),
  itemOrder='official scoring-key order; not a claimed original paper item number',items=items))

def records(p):
    ws = openpyxl.load_workbook(p, read_only=True, data_only=True).active
    rows = iter(ws.values); headers = next(rows)
    return [dict(zip(headers, row)) for row in rows]
occupation_path=ROOT/'.sources/OccupationData-31.0.xlsx'
interest_path=ROOT/'.sources/CareerInterestTypes-31.0.xlsx'
scale_path=ROOT/'.sources/ScalesReference-31.0.xlsx'
oi_scales=[r for r in records(scale_path) if r['Scale ID']=='OI']
assert len(oi_scales)==1, 'Review official scale reference before continuing'
scale_min,scale_max=oi_scales[0]['Minimum'],oi_scales[0]['Maximum']
assert (scale_min,scale_max)==(1,7), 'Official OI scale changed; do not guess'
profiles={}; excluded=[]
for r in records(interest_path):
    if r['Scale ID']!='OI' or r['Element ID'] not in ['1.B.1.'+x for x in 'abcdef']: continue
    code=r['O*NET-SOC Code']; element=r['Element ID']
    stamp=datetime.datetime.strptime(r['Date'],'%m/%Y').date().isoformat()
    entry=dict(elementId=element,elementName=r['Element Name'],scaleId='OI',raw=r['Data Value'],updatedAt=stamp,domainSource=r['Domain Source'])
    prev=profiles.setdefault(code,{}).get(element)
    if prev is None or stamp>prev['updatedAt']: profiles[code][element]=entry
    elif stamp==prev['updatedAt']: assert prev['raw']==entry['raw'], 'Conflicting same-date official rows'
entries=[]
for r in records(occupation_path):
    code=r['O*NET-SOC Code']; values=profiles.get(code,{})
    if len(values)!=6:
        excluded.append(dict(onetCode=code,reason='incomplete_six_dimensions')); continue
    vector=[values['1.B.1.'+x]['raw'] for x in 'abcdef']
    assert all(isinstance(x,(int,float)) and scale_min<=x<=scale_max for x in vector)
    entries.append(dict(onetCode=code,title=r['Title'],description=r['Description'],interestVector=vector,
      ratings=[values['1.B.1.'+x] for x in 'abcdef'],sourceUrl='https://www.onetonline.org/link/summary/'+code))
emit(ROOT/'data/onet-31.0.json',dict(catalogVersion='onet-31.0-OI-1',databaseVersion='31.0',
  dimensions=['realistic','investigative','artistic','social','enterprising','conventional'],
  scaleId='OI',scaleRange=dict(minimum=scale_min,maximum=scale_max),transform='none; Pearson uses official raw values; no divide_by_9',license='CC-BY-4.0',
  attribution='O*NET® 31.0 Database, USDOL/ETA. Selected and reorganized by 求职 X-Ray; no endorsement.',
  sources=[dict(url='https://www.onetcenter.org/dl_files/database/db_31_0_excel/Occupation%20Data.xlsx',sha256=digest(occupation_path)),
           dict(url='https://www.onetcenter.org/dl_files/database/db_31_0_excel/Career%20Interest%20Types.xlsx',sha256=digest(interest_path)),
           dict(url='https://www.onetcenter.org/dl_files/database/db_31_0_excel/Scales%20Reference.xlsx',sha256=digest(scale_path))],
  loadedCount=len(entries)+len(excluded),completeCount=len(entries),excluded=excluded,entries=entries),compact=True)
print(json.dumps(dict(items=len(items),occupations=len(entries),excluded=len(excluded))))
