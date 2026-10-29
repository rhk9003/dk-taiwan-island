// 成效追蹤：
// 1. 連到官網（dk-shoes.com.tw）的網址一律補上 UTM，官網的 GA4／91APP 後台就分得出「從台灣島來的流量和訂單」。
// 2. site.json 的 analytics 填了 GA4 評估 ID 或 Meta 像素 ID，才載入追蹤碼、送事件；沒填就只做 UTM。
// 網址加 ?debug 會在 console 印出每個事件，方便檢查。

const SHOP_HOST = /(^|\.)dk-shoes\.com\.tw$/i;
const debug = new URLSearchParams(location.search).has('debug');
let cfg = { campaign: 'dk_taiwan_island' };
let place = 'island'; // 客人現在在看哪裡（門市、集章冊…），放進 utm_content

export function initTracking(analytics) {
  const ga4 = /^G-[A-Z0-9]{4,}$/.test(analytics?.ga4 || '') ? analytics.ga4 : '';
  const pixel = /^\d{10,20}$/.test(analytics?.metaPixel || '') ? analytics.metaPixel : '';
  cfg = { campaign: analytics?.campaign || cfg.campaign, ga4, pixel };
  if (ga4) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() { window.dataLayer.push(arguments); }; // gtag 規定要推 arguments 物件
    window.gtag('js', new Date());
    window.gtag('config', ga4);
    document.head.append(Object.assign(document.createElement('script'), { async: true, src: `https://www.googletagmanager.com/gtag/js?id=${ga4}` }));
  }
  if (pixel) {
    // Meta 像素官方載入碼（改寫成不汙染全域變數名稱的版本）
    const fbq = (window.fbq = function fbq(...args) { fbq.callMethod ? fbq.callMethod(...args) : fbq.queue.push(args); });
    if (!window._fbq) window._fbq = fbq;
    Object.assign(fbq, { push: fbq, loaded: true, version: '2.0', queue: [] });
    document.head.append(Object.assign(document.createElement('script'), { async: true, src: 'https://connect.facebook.net/en_US/fbevents.js' }));
    fbq('init', pixel);
    fbq('track', 'PageView');
  }
}

/** 客人換地方看了（門市、分區、集章冊…），之後點官網連結的 utm_content 就帶這個 */
export function setPlace(value) {
  place = String(value || 'island').slice(0, 60);
}

/** 官網網址補上 UTM（已經有 utm_source 就不動）；不是官網的網址原樣回傳 */
export function withUtm(url, content = place) {
  try {
    const u = new URL(url, location.href);
    if (!SHOP_HOST.test(u.hostname) || u.searchParams.has('utm_source')) return url;
    u.searchParams.set('utm_source', 'dk_taiwan_island');
    u.searchParams.set('utm_medium', 'referral');
    u.searchParams.set('utm_campaign', cfg.campaign);
    u.searchParams.set('utm_content', content);
    return u.toString();
  } catch {
    return url;
  }
}

/** 送一個事件到 GA4／Meta 像素（有設定才送） */
export function track(name, params = {}) {
  const p = { place, ...params };
  if (cfg.ga4) window.gtag?.('event', name, p);
  if (cfg.pixel) window.fbq?.('trackCustom', name, p);
  if (debug) console.info('[track]', name, p);
}

// 點任何連到官網的連結：送出前補上 UTM，再記一筆 outbound_click（中鍵開新分頁也算）
function onLink(e) {
  const a = e.target.closest?.('a[href]');
  if (!a || !/^https?:/i.test(a.href)) return;
  const host = new URL(a.href).hostname;
  if (SHOP_HOST.test(host)) a.href = withUtm(a.href);
  track('outbound_click', { link_domain: host, link_url: a.href.slice(0, 200), link_text: (a.textContent || '').trim().slice(0, 40) });
}
document.addEventListener('click', onLink, true);
document.addEventListener('auxclick', onLink, true);
