"""Validate actual document structure, references and rubric requirements."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote
import re
ROOT = Path(__file__).resolve().parents[1]
class Document(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=True)
        self.nodes=[]
        self.feed(source)
    def handle_starttag(self, tag, attrs): self.nodes.append((tag,dict(attrs)))

pages=list(ROOT.glob('*.html'))
assert len(pages)>=4
classes=set()
for page in pages:
    doc=Document(page.read_text(encoding='utf-8'))
    ids=[a['id'] for _,a in doc.nodes if 'id' in a]
    assert len(ids)==len(set(ids)), f'Duplicate id: {page.name}'
    assert sum(t=='main' for t,_ in doc.nodes)==1
    assert any(t=='html' and a.get('lang')=='ru' for t,a in doc.nodes)
    assert any(t=='meta' and a.get('name')=='viewport' for t,a in doc.nodes)
    links=[a.get('href') for t,a in doc.nodes if t=='link' and a.get('rel')=='stylesheet']
    assert links==['vendor/bootstrap/css/bootstrap.min.css','css/custom.css']
    assert any(t=='script' and a.get('src')=='vendor/bootstrap/js/bootstrap.bundle.min.js' for t,a in doc.nodes)
    for tag,attrs in doc.nodes:
        classes.update(attrs.get('class','').split())
        for key in ('href','src'):
            ref=attrs.get(key,'')
            if not ref or urlsplit(ref).scheme or ref.startswith('//'): continue
            parts=urlsplit(ref)
            target=ROOT/unquote(parts.path) if parts.path else page
            assert target.is_file(), f'{page.name}: missing {ref}'
            if parts.fragment:
                target_ids=[a.get('id') for _,a in Document(target.read_text(encoding='utf-8')).nodes]
                assert parts.fragment in target_ids, f'{page.name}: missing anchor {ref}'
        if tag=='img': assert 'alt' in attrs and 'width' in attrs and 'height' in attrs
        if tag=='button': assert 'type' in attrs
        if tag in ('input','select','textarea'):
            assert attrs.get('name') and attrs.get('id'), f'Missing form field name/id in {page.name}'
            assert any(t=='label' and a.get('for')==attrs['id'] for t,a in doc.nodes), f'Missing label in {page.name}'
        for key in ('aria-controls','aria-labelledby','aria-describedby'):
            for identity in attrs.get(key,'').split(): assert identity in ids, f'{page.name}: invalid {key}={identity}'
required={'container','row','col-12','col-md-6','col-lg-4','g-4','navbar','card','btn','badge','alert','modal','form-control','form-select','input-group','form-check','accordion','toast','pagination','nav-tabs'}
assert required<=classes, f'Missing components: {required-classes}'
css=(ROOT/'css/custom.css').read_text(encoding='utf-8')
assert not re.search(r'#[a-z][\w-]*\s*\{',css), 'Use classes, not id selectors'
for asset in ['css/bootstrap.min.css','js/bootstrap.bundle.min.js']:
    assert re.search(r'Bootstrap\s+v5\.3\.8', (ROOT/'vendor/bootstrap'/asset).read_text(encoding='utf-8'))
assert (ROOT/'vendor/bootstrap/LICENSE').is_file()
print(f'PASS: {len(pages)} pages, all local links/anchors, labels, ARIA references, required components and Bootstrap 5.3.8')
