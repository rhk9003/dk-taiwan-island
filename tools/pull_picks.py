"""列出店長新填、還沒整理進 data/picks.json 的內容：python tools/pull_picks.py

店長在表單填的原文不會直接上島，要先整理（統一格式、型號對到官網商品、修正錯字和不正確的說法）
再寫進 data/picks.json。這支程式讀「店長的話蒐集」試算表，把要整理的店和店長原文存成
tools/picks_todo.json（UTF-8），整理時照著看。
"""
import json
import urllib.request
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
site = json.loads((ROOT / 'data' / 'site.json').read_text(encoding='utf-8'))
curated = json.loads((ROOT / 'data' / 'picks.json').read_text(encoding='utf-8')).get('stores', {})

with urllib.request.urlopen(site['managerPicksUrl'], timeout=30) as res:
    raw = json.load(res)

todo = []
for sid, p in raw.get('stores', {}).items():
    if not p.get('filled'):
        continue
    done = curated.get(sid, {}).get('source')
    if done and datetime.fromisoformat(p['submittedAt']) <= datetime.fromisoformat(done):
        continue
    todo.append({
        'id': sid,
        'store': p.get('name'),
        'why': '重填了' if done else '還沒整理',
        'submittedAt': p.get('submittedAt'),
        'managerName': p.get('managerName'),
        'quote': p.get('quote'),
        'product': p.get('product'),
    })

out = ROOT / 'tools' / 'picks_todo.json'
out.write_text(json.dumps(todo, ensure_ascii=False, indent=1), encoding='utf-8')
filled = sum(1 for p in raw.get('stores', {}).values() if p.get('filled'))
print(f'{filled} stores filled, {len(curated)} curated, {len(todo)} to do -> {out.relative_to(ROOT)}')
