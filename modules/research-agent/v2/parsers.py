"""Source text and physical locators. No OCR guesses, dates from URLs, or invented cells."""
from __future__ import annotations
import hashlib
import io
import re
import time
from urllib.parse import urljoin
from bs4 import BeautifulSoup
from . import PARSER_VERSION
from .transport import SourceError, canonical_url


def clean(value):
    return re.sub(r'[ \t\r\f\v]+', ' ', str(value or '')).strip()


def parse_html(body: bytes, url: str) -> dict:
    soup = BeautifulSoup(body, 'html.parser')
    title = clean(soup.title.get_text(' ', strip=True) if soup.title else '')
    visible = soup.get_text(' ', strip=True)
    if re.search(r'验证码|安全验证|访问验证|Access Denied|Just a moment|人机验证', title, re.I) or (len(visible)<4000 and re.search(r'请完成.{0,12}验证|请输入验证码|verify you are human|captcha', visible, re.I)):
        raise SourceError('blocked', 'parse', 'verification_page')
    if soup.select_one('input[type=password]') and len(visible)<5000:
        raise SourceError('login_required', 'parse', 'login_page')
    published = None
    for key in ('article:published_time','datePublished','pubdate','publishdate','publishDate','date'):
        node = soup.find('meta', attrs={'property':key}) or soup.find('meta', attrs={'name':key})
        if node and node.get('content'):
            published = str(node['content'])[:100]
            break
    if published is None:
        node = soup.find('time', attrs={'datetime':True})
        if node:
            published = str(node['datetime'])[:100]
    links = []
    for a in soup.select('a[href]'):
        try:
            href = canonical_url(urljoin(url, str(a['href'])))
        except SourceError:
            continue
        label = clean(a.get_text(' ', strip=True))
        if re.search(r'\.pdf(?:\?|$)',href,re.I) or re.search(r'年度报告|半年度报告|审计报告|公告全文',label):
            links.append({'url':href,'title':label})
    for node in soup.select('script,style,noscript,nav,header,footer,aside,form,svg'):
        node.decompose()
    main = soup.find('article') or soup.find('main') or soup.body or soup
    text = '\n'.join(clean(line) for line in main.get_text('\n',strip=True).splitlines() if clean(line))
    if len(text)<30:
        raise SourceError('parse_error', 'parse', 'no_article_body')
    if len(text)>1_500_000:
        raise SourceError('unsupported', 'parse', 'text_limit')
    paragraphs=[{'paragraph':i+1,'text':line} for i,line in enumerate(text.splitlines())]
    tables=[]
    for i,table in enumerate(main.find_all('table')):
        rows=[[clean(cell.get_text(' ',strip=True)) for cell in row.find_all(['td','th'])] for row in table.find_all('tr')]
        previous=table.find_previous(['h1','h2','h3','h4','p'])
        tables.append({'table':i+1,'rows':rows,'context':clean(previous.get_text(' ',strip=True)) if previous else '', 'physical_page':None})
    origin=None
    for link in main.select('a[href]'):
        if re.search(r'原文|原始来源|转载自',link.get_text()):
            try: origin=canonical_url(urljoin(url,str(link['href'])))
            except SourceError: pass
            break
    return {'title':title,'text':text,'pages':[], 'paragraphs':paragraphs,'tables':tables,'published_at':published,'links':links[:30],'origin_url':origin,'parser_version':PARSER_VERSION,'warnings':[]}


def parse_pdf(body: bytes, *, max_pages=400, seconds=45) -> dict:
    import pypdfium2
    started=time.monotonic()
    if not body.startswith(b'%PDF-'):
        raise SourceError('parse_error','pdf','invalid_pdf_signature')
    try:
        reader=pypdfium2.PdfDocument(body)
        if len(reader)>max_pages:
            raise SourceError('unsupported','pdf','page_limit')
        pages=[]
        for i in range(len(reader)):
            if time.monotonic()-started>seconds:
                raise SourceError('timeout','pdf','parse_deadline')
            page=reader[i]
            text_page=page.get_textpage()
            if text_page.count_chars()>150_000:
                raise SourceError('unsupported','pdf','page_text_limit')
            text=text_page.get_text_bounded() or ''
            text_page.close()
            page.close()
            if len(text)>150_000:
                raise SourceError('unsupported','pdf','page_text_limit')
            lines=[clean(x) for x in text.splitlines() if clean(x)]
            printed=next((m[1] for line in lines if (m:=re.fullmatch(r'(\d{1,4})\s*/\s*\d{1,4}',line))),None)
            if printed is None:
                printed=next((line for line in reversed(lines[-3:]) if re.fullmatch(r'\d{1,4}',line)),None)
            pages.append({'physical_page':i+1,'printed_page':printed,'text':'\n'.join(lines)})
        reader.close()
        text='\n\n'.join(p['text'] for p in pages)
        if len(text.strip())<100:
            raise SourceError('parse_error','pdf','scan_or_no_text_ocr_unavailable')
        if len(text)>3_000_000:
            raise SourceError('unsupported','pdf','document_text_limit')
        tables=[]; warnings=[]
        selected=set()
        for p in pages:
            if re.search(r'(?:合并|母公司)(?:资产负债表|利润表|现金流量表)',p['text']) and '单位' in p['text']:
                selected.update(range(p['physical_page'],min(p['physical_page']+3,len(pages)+1)))
            elif '主要会计数据' in p['text'] and '营业收入' in p['text']:
                selected.add(p['physical_page'])
            elif re.search(r'在职员工的数量合计|在职员工总数',p['text']):
                selected.add(p['physical_page'])
        candidates=[p for p in pages if p['physical_page'] in selected][:24]
        try:
            import pdfplumber
            with pdfplumber.open(io.BytesIO(body)) as pdf:
                for p in candidates:
                    if time.monotonic()-started>seconds:
                        warnings.append('table_parse_budget_exhausted'); break
                    page=pdf.pages[p['physical_page']-1]
                    for j,table in enumerate(page.find_tables()):
                        prefix=page.crop((0,0,page.width,max(1,table.bbox[1]))).extract_text() or ''
                        tables.append({'physical_page':p['physical_page'],'printed_page':p['printed_page'],'table':j+1,
                            'rows':[[clean(c) for c in row] for row in table.extract()],
                            'context':prefix[-1600:],'bbox':list(table.bbox)})
        except ImportError:
            warnings.append('table_parser_not_configured')
        except Exception:
            warnings.append('table_parse_error_numbers_not_inferred')
        previous=None
        for table in tables:
            header=next((row for row in table['rows'][:3] if sum(bool(re.fullmatch(r'20\d{2}年(?:度|\d{1,2}月\d{1,2}日)?',re.sub(r'\s+','',c))) for c in row)>=2),None)
            statement=bool(re.search(r'(?:合并|母公司)(?:资产负债表|利润表|现金流量表)',table['context']))
            if header and statement:
                table['column_header']=header
                previous=table
            elif previous and table['physical_page']==previous['physical_page']+1 and table['rows'] and len(table['rows'][0])==len(previous['column_header']) and not re.search(r'(?:合并|母公司).{0,4}表',table['context']):
                table['column_header']=previous['column_header']
                table['continued_from']=previous.get('continued_from',{'physical_page':previous['physical_page'],'table':previous['table']})
                table['context']=previous['context']+'\n续表：'+table['context']
                previous=table
            else:
                previous=None
        if not tables: warnings.append('no_aligned_tables')
        title=' '.join(pages[0]['text'].splitlines()[:8])[:400]
        return {'title':title,'text':text,'pages':pages,'paragraphs':[],'tables':tables,'published_at':None,'links':[],'origin_url':None,'parser_version':PARSER_VERSION,'warnings':warnings}
    except SourceError:
        raise
    except Exception:
        raise SourceError('parse_error','pdf','pdf_parse_failed')


def content_hash(text: str) -> str:
    return hashlib.sha256(re.sub(r'\s+','',text).encode('utf-8')).hexdigest()
