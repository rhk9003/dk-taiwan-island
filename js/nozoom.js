// 不讓整頁被放大：兩指縮放只縮 3D 地圖。
// index.html 的 viewport 已經寫了不能縮放、CSS 用 touch-action 擋，但 iPhone 的 Safari 兩個都不完全照做，這裡再補兩層：
// 1. iPhone 自己的縮放手勢（gesturestart／gesturechange）直接擋掉；兩指在地圖以外的地方移動也擋掉
// 2. 萬一還是被放大了（visualViewport.scale > 1），自動縮回原本大小，客人不會卡在放大的畫面

export function preventPageZoom() {
  const block = (e) => e.preventDefault();
  document.addEventListener('gesturestart', block, { passive: false });
  document.addEventListener('gesturechange', block, { passive: false });
  // 地圖（canvas）自己用 pointer 事件處理兩指縮放，擋 touchmove 不影響它
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

  const vv = window.visualViewport;
  const meta = document.querySelector('meta[name="viewport"]');
  if (!vv || !meta) return;
  const base = meta.getAttribute('content');
  let timer = 0;
  vv.addEventListener('resize', () => {
    clearTimeout(timer);
    // 等手指放開、畫面停下來再縮回去；改一下 viewport 再改回來，瀏覽器就會回到 1 倍
    timer = setTimeout(() => {
      if (vv.scale <= 1.01) return;
      meta.setAttribute('content', base.replace('initial-scale=1,', 'initial-scale=1.0001,'));
      requestAnimationFrame(() => meta.setAttribute('content', base));
    }, 350);
  });
}
