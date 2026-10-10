"""Regenerate the lossless design index. Does not implement or certify topic capabilities."""
import hashlib, json, zipfile
from pathlib import Path
root = Path(__file__).resolve().parents[1]
source = root / 'docs/agent-v3/source/一家公司完整Agent运行树.xmind'
with zipfile.ZipFile(source) as archive:
    if archive.getinfo('content.json').file_size > 5_000_000:
        raise ValueError('Oversized design')
    sheets = json.loads(archive.read('content.json'))
nodes = []
stages = {'01':'planning','02':'routing','03':'processing','04':'interpretation','05':'followup','06':'archive'}
def walk(topic, parent=None, path=None, stage='root'):
    title = topic['title']
    if parent == sheets[0]['rootTopic']['id']:
        stage = stages.get(title[:2], 'groups' if title.startswith('群聊') else 'tools' if title.startswith('采集技术') else 'legend')
    children = topic.get('children', {}).get('attached', [])
    branch = (path or []) + [title]
    nodes.append({'id':topic['id'],'parentId':parent,'title':title,'path':branch,'stage':stage,'leaf':not children})
    for child in children:
        walk(child, topic['id'], branch, stage)
walk(sheets[0]['rootTopic'])
if len({n['id'] for n in nodes}) != len(nodes):
    raise ValueError('Duplicate design IDs')
target = root / 'modules/research-agent/xmind/tree.json'
target.write_text(json.dumps({'designSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'nodes':nodes,'relationships':sheets[0].get('relationships',[])},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f'{len(nodes)} design nodes indexed; source unchanged')
