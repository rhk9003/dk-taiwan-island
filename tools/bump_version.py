"""改了 js/ 或 css/ 之後跑一次：python tools/bump_version.py

GitHub Pages 讓瀏覽器把 js、css 留 10 分鐘，剛更新時客人可能拿到「舊程式＋新資料」而出錯。
這支程式把 index.html 裡所有 js、css 的網址加上新的版本號（?v=時間），瀏覽器就會馬上抓新版。
data/ 的 json 本來就每次重抓，只改資料不用跑。
"""
import json
import re
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
index = ROOT / 'index.html'
html = index.read_text(encoding='utf-8')
version = datetime.now().strftime('%Y%m%d%H%M')

# 樣式表和進入點
html = re.sub(r'href="css/style\.css(\?v=[^"]*)?"', f'href="css/style.css?v={version}"', html)
html = re.sub(r'src="js/main\.js(\?v=[^"]*)?"', f'src="js/main.js?v={version}"', html)

# importmap：js/ 底下每個模組都對應到帶版本號的網址（模組之間的 import 也會跟著換）
match = re.search(r'(<script type="importmap">)(.*?)(</script>)', html, re.S)
imports = {k: v for k, v in json.loads(match.group(2))['imports'].items() if not k.startswith('./js/')}
for f in sorted((ROOT / 'js').glob('*.js')):
    imports[f'./js/{f.name}'] = f'./js/{f.name}?v={version}'
body = json.dumps({'imports': imports}, ensure_ascii=False, indent=2).replace('\n', '\n    ')
html = html[:match.start(2)] + '\n    ' + body + '\n  ' + html[match.end(2):]

index.write_text(html, encoding='utf-8')
print(f'version {version}: {len(imports) - 2} js modules + style.css')
