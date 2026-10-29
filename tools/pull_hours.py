"""從官網（91APP）的門市資料抓營業時間，寫進 data/stores.json 每間店的 hours。

用法：python tools/pull_hours.py
門市改營業時間、新開店時重跑一次就好；對不到名字的店會列出來。
"""
import json
import re
import urllib.request
from pathlib import Path

API = ('https://webapi.91app.com/webapi/LocationV2/GetLocationList'
       '?lat=25.04&lon=121.55&startIndex=0&maxCount=200&r=null&isEnableRetailStore=false&lang=zh-TW&shopId=40931')
STORES = Path(__file__).resolve().parent.parent / 'data' / 'stores.json'


def main():
    req = urllib.request.Request(API, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=20) as res:
        rows = json.load(res)['Data']['List']
    official = {r['Name'].strip(): r for r in rows}

    text = STORES.read_text(encoding='utf-8')
    data = json.loads(text)
    missing = []
    for s in data['stores']:
        r = official.get(s['name'])
        if not r:
            missing.append(s['name'])
            continue
        hours = {'weekday': (r.get('NormalTime') or '').strip(), 'weekend': (r.get('WeekendTime') or '').strip()}
        if hours['weekday']:
            s['hours'] = hours
    STORES.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'{len(data["stores"]) - len(missing)} 間寫入營業時間')
    for name in missing:
        print('官網找不到：', name)


if __name__ == '__main__':
    main()
