/**
 * DK 台灣島｜整個中央山脈就是我的伸展台（Google Apps Script 獨立專案）
 *
 * 客人上傳穿 DK 鞋的穿搭照，照片存在 Google Drive，試算表一張照片一列。
 * 照片一律先審再上牆：在試算表勾「通過」才會出現在島上（照片裡要看得到 DK 的鞋）；上牆後勾「隱藏」就拿掉。
 * 跟店長表單、島民證分開：自己的排隊鎖、自己的試算表和 Drive 資料夾。
 *
 *   setup   第一次使用時在編輯器上方選它再按「執行」：建立「DK 台灣島 伸展台」試算表和 Drive 照片資料夾
 *           （ID 記在指令碼屬性），順便測試照片能不能設成「知道連結的人都能看」。執行紀錄會印出網址。重跑也安全。
 *   doPost  台灣島送來的要求（text/plain 的 JSON）：
 *     { role: "upload", submissionId, deviceId, nickname, shoe, text, agree: true, image, thumb, website, version }
 *        image／thumb 是台灣島在手機上縮好的 JPEG（base64，已經去掉拍照地點等資訊）
 *        → 存進 Drive、試算表新增一列（還沒通過）→ {ok:true, id}
 *     { role: "vote", submissionId, deviceId, photoId, version }
 *        → 同一台裝置每天每張照片一票 → {ok:true, votes:目前票數}
 *     失敗一律回 {ok:false, message:"給客人看的說明"}。
 *   doGet   ?（沒參數）  已通過、沒隱藏的照片，票數高到低 → {ok:true, sharing, photos:[{id, nickname, shoe, text, votes, at, full, thumb}]}
 *                         full／thumb 是 Drive 檔案 ID；sharing 是 true 時台灣島直接用 Drive 縮圖網址顯示
 *           ?status=id,id 自己上傳的照片審核狀態 → {ok:true, status:{id:"pending"|"approved"|"hidden"}}
 *           ?photo=id&size=thumb|full  照片內容（sharing 是 false 時台灣島改用這個）→ {ok:true, data:"data:image/jpeg;base64,…"}
 *
 *           ?admin=審核密鑰  審核頁：看待審核的照片，按「通過」「不通過」（等於在試算表勾「通過」「隱藏」）。
 *                         密鑰由 setup 產生、存在指令碼屬性；部署後在編輯器選 adminLink 按「執行」，執行紀錄會印出審核頁網址。
 *                         網址就是鑰匙，不要外流；外流時再跑一次 resetAdminKey 換一把。
 *
 * 限制：每台裝置最多上傳 3 張、30 秒內不能連續上傳、全部一天最多 300 張；每台裝置一天最多投 50 票。
 * 試算表和 Drive 資料夾不要分享出去（裡面有裝置代號）。
 */

var SHEET_NAME = '伸展台';
var HEADERS = ['照片ID','上傳時間','裝置代號','暱稱','穿哪雙','一句話','大圖檔案ID','小圖檔案ID','通過','隱藏','票數','版本'];
var COL = {id:0, at:1, deviceId:2, nickname:3, shoe:4, text:5, full:6, thumb:7, approved:8, hidden:9, votes:10, version:11};
var VOTE_SHEET = '投票紀錄';
var VOTE_HEADERS = ['投票時間','照片ID','裝置代號','日期'];
var TIME_ZONE = 'Asia/Taipei';
var MAX_UPLOADS_PER_DEVICE = 3;
var MAX_UPLOADS_PER_DAY = 300;
var MAX_VOTES_PER_DAY = 50;
var UPLOAD_COOLDOWN_SECONDS = 30;
var LIST_CACHE_SECONDS = 60;       // 勾了「通過」最慢 1 分鐘出現在島上
var MAX_IMAGE_B64 = 1600000;       // 大圖 base64 上限（約 1.2MB）
var MAX_THUMB_B64 = 140000;        // 小圖 base64 上限（約 100KB）
var LIMITS = {nickname:10, shoe:20, text:30};
var DEFAULT_NICKNAME = '島上的模特兒';

// 公開文字規則：和台灣島前端 js/textrules.js、店長表單 Code.gs 一致（防網址、程式碼、聯絡方式、冒充客服）
var INVISIBLE_CHARS = /[\u0000-\u001F\u007F​-‏‪-‮⁠-⁤﻿]/g;
var TEXT_RULES = [
  [/(https?:|www\.|:\/\/)/i, '不能放網址喔！'],
  [/[a-z0-9-]+\s*(\.|。|點|dot)\s*(com|net|org|tw|io|cc|me|xyz|top|info|co|ly|gl|app|site|link|shop|live|tv)\b/i, '不能放網址喔！'],
  [/[<>{}\[\]\x60\\=]/, '不能放程式碼或特殊符號（< > { } [ ] = 等）喔！'],
  [/(script|javascript:|onerror|onload|eval\(|&#|%3c)/i, '不能放程式碼或特殊符號（< > { } [ ] = 等）喔！'],
  [/@/, '不能放帳號或 email 喔！'],
  [/(\d[\s-]?){9,}/, '為了保護個資，不能留電話或一長串數字喔！'],
  [/(.)\1{9,}/u, '不要洗版喔！'],
  [/(?<![a-z0-9])(?=[a-z0-9_.-]{4,})[a-z][a-z0-9_.-]*\d/i, '不能留聯絡方式或帳號喔！'],
  [/加\s*(?=[a-z0-9_.-]*[a-z])[a-z0-9_.-]{4,}/i, '不能留聯絡方式或帳號喔！']
];
var SQUASH = /[\s\p{P}\p{S}]/gu;
var SCAM_HARMLESS = /(online|deadline|airline|outline|linen)/g;
var SCAM_RULE = [/(客服|官方|公告|專員|總部|系統通知|加賴|賴id|密賴|私賴|賴我|ㄌㄞ|line|微信|wechat|telegram|whatsapp|私訊|私聊|聯繫|聯絡|來電|電話|專線|扣款|退款|退費|匯款|轉帳|帳戶|帳號|分期|定期購|信用卡|卡號|atm|驗證碼|個資|加好友|加我)/,
  '為了防詐騙，不能提到客服、官方、LINE、帳戶或付款喔！'];
var NICKNAME_RULE = [/(官方|客服|店長|店員|門市|小編|專員|公告|總部|系統|管理員|admin|staff|dk|dr\.?kao|高博士)/i, '暱稱不能用 DK、官方、客服、門市、店長等字樣喔！'];
var BANNED_WORDS = [
  '幹你娘','幹恁娘','幹您娘','幹你老母','幹你老師','姦你娘','操你媽','操你娘','肏你','草泥馬',
  '靠北','靠杯','靠夭','靠腰','機掰','雞掰','機歪','機八','雞八','機巴','雞巴','懶叫','懶趴','卵叫',
  '婊子','賤人','賤貨','賤婊','破麻','白癡','白痴','智障','腦殘','低能兒','去死','死全家','垃圾人',
  '王八蛋','狗娘養','三小','支那','娘炮','黑鬼','阿六仔','番仔',
  'fuck','fuk','shit','bitch','asshole','bastard','cunt','motherfucker','wtf'
];


/* ---------- 第一次設定 ---------- */

function setup() {
  var props = PropertiesService.getScriptProperties();
  var bookId = props.getProperty('SPREADSHEET_ID');
  var book = bookId ? SpreadsheetApp.openById(bookId) : SpreadsheetApp.create('DK 台灣島 伸展台');
  props.setProperty('SPREADSHEET_ID', book.getId());
  book.setSpreadsheetTimeZone(TIME_ZONE);

  var sheet = book.getSheetByName(SHEET_NAME);
  if (!sheet) {
    var first = book.getSheets()[0];
    sheet = first.getLastRow() === 0 ? first.setName(SHEET_NAME) : book.insertSheet(SHEET_NAME);
  }
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold').setBackground('#f3e6e8');
  sheet.setFrozenRows(1);
  [280, 150, 120, 110, 160, 240, 120, 120, 60, 60, 60, 80].forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); });
  sheet.getRange(1, COL.approved + 1).setNote('照片裡看得到 DK 的鞋、內容沒問題才勾。勾了最慢 1 分鐘出現在島上。看照片：大圖檔案ID 貼到 https://drive.google.com/file/d/檔案ID/view');
  sheet.getRange(1, COL.hidden + 1).setNote('已經上牆的照片要拿掉就勾這格。');

  var votes = book.getSheetByName(VOTE_SHEET) || book.insertSheet(VOTE_SHEET);
  votes.getRange(1, 1, 1, VOTE_HEADERS.length).setValues([VOTE_HEADERS]).setFontWeight('bold').setBackground('#f3e6e8');
  votes.setFrozenRows(1);

  var folderId = props.getProperty('FOLDER_ID');
  var folder = null;
  try { folder = folderId ? DriveApp.getFolderById(folderId) : null; } catch (_) { folder = null; }
  if (!folder) folder = DriveApp.createFolder('DK 台灣島 伸展台照片');
  props.setProperty('FOLDER_ID', folder.getId());

  // 測試這個帳號能不能把檔案設成「知道連結的人都能看」（公司帳號可能被管理員關掉）
  var sharing = 'false';
  var probe = folder.createFile(Utilities.newBlob('test', 'text/plain', 'sharing-test.txt'));
  try {
    probe.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    sharing = 'true';
  } catch (e) {
    console.warn('不能設成知道連結的人都能看，照片會改由這個程式轉送：' + e.message);
  }
  probe.setTrashed(true);
  props.setProperty('SHARING_OK', sharing);
  if (!props.getProperty('ADMIN_KEY')) resetAdminKey();

  console.log('伸展台試算表：' + book.getUrl());
  console.log('照片資料夾：' + folder.getUrl());
  console.log('照片直接用 Drive 連結顯示：' + (sharing === 'true' ? '可以' : '不行，改由程式轉送'));
}

/** 審核頁的密鑰換一把新的（舊的審核頁網址立刻失效）。 */
function resetAdminKey() {
  PropertiesService.getScriptProperties().setProperty('ADMIN_KEY', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''));
  adminLink();
}

/** 印出審核頁網址（要先部署成網頁應用程式才有網址）。 */
function adminLink() {
  var url = ScriptApp.getService().getUrl();
  var key = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  console.log(url ? '審核頁：' + url + '?admin=' + key : '還沒部署成網頁應用程式，部署後再執行 adminLink。');
}


/* ---------- 網頁進入點 ---------- */

function doGet(event) {
  try {
    var p = (event && event.parameter) || {};
    if (p.admin !== undefined) return adminPage_(String(p.admin));
    if (p.status) return json_(status_(String(p.status)));
    if (p.photo) return json_(photo_(String(p.photo), p.size === 'full' ? 'full' : 'thumb'));
    return json_(list_());
  } catch (error) {
    if (!error.publicMessage) console.error(error);
    return json_({ok:false, message:error.publicMessage || '暫時讀不到伸展台，請稍後再試。'});
  }
}

function doPost(event) {
  var lock;
  try {
    var raw = event && event.postData && event.postData.contents;
    if (!raw || raw.length > MAX_IMAGE_B64 + MAX_THUMB_B64 + 4000) fail_('照片太大了，請換一張再試。');
    var data;
    try { data = JSON.parse(raw); } catch (_) { fail_('資料格式不正確，請重新整理後再試。'); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail_('資料格式不正確，請重新整理後再試。');
    var deviceId = typeof data.deviceId === 'string' ? data.deviceId : '';
    if (!/^[A-Za-z0-9_-]{16,40}$/.test(deviceId)) fail_('裝置識別碼不正確，請重新整理後再試。');
    if (data.role !== 'upload' && data.role !== 'vote') fail_('不認得這個要求，請重新整理後再試。');
    // 機器人會填隱藏欄位：假裝成功，什麼都不存
    if (data.website) return json_(data.role === 'upload' ? {ok:true, id:''} : {ok:true, votes:0});
    var upload = data.role === 'upload' ? checkUpload_(data, deviceId) : null;
    lock = LockService.getScriptLock();
    if (!lock.tryLock(15000)) fail_('目前比較忙，請稍後再試。');
    return json_(upload ? saveUpload_(upload) : vote_(deviceId, String(data.photoId || '')));
  } catch (error) {
    if (!error.publicMessage) console.error(error);
    return json_({ok:false, message:error.publicMessage || '暫時連不上伸展台，請稍後再試。'});
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
}


/* ---------- 上傳 ---------- */

/** 檢查欄位和照片（不用排隊），通過就回傳整理好的資料。 */
function checkUpload_(data, deviceId) {
  var id = typeof data.submissionId === 'string' ? data.submissionId : '';
  if (!/^[A-Za-z0-9-]{16,64}$/.test(id)) fail_('資料格式不正確，請重新整理後再試。');
  if (data.agree !== true) fail_('請先勾選同意照片公開展示。');
  var image = jpeg_(data.image, MAX_IMAGE_B64);
  var thumb = jpeg_(data.thumb, MAX_THUMB_B64);
  if (!image || !thumb) fail_('照片讀不出來，請換一張再試。');
  return {
    id:id,
    deviceId:deviceId,
    nickname:publicText_(data.nickname, '暱稱', LIMITS.nickname, true) || DEFAULT_NICKNAME,
    shoe:publicText_(data.shoe, '穿哪雙', LIMITS.shoe, false),
    text:publicText_(data.text, '一句話', LIMITS.text, false),
    image:image,
    thumb:thumb,
    version:String(data.version || '').slice(0, 20)
  };
}

/** base64 解開後要是 JPEG（開頭 FF D8 FF）才收。 */
function jpeg_(value, max) {
  if (typeof value !== 'string' || !value || value.length > max) return null;
  var bytes;
  try { bytes = Utilities.base64Decode(value.replace(/^data:image\/jpeg;base64,/, '')); } catch (_) { return null; }
  if (bytes.length < 100 || bytes[0] !== -1 || bytes[1] !== -40 || bytes[2] !== -1) return null;
  return bytes;
}

function saveUpload_(u) {
  var sheet = sheet_(SHEET_NAME);
  var rows = rows_(sheet, HEADERS.length);
  var today = day_(new Date());
  var mine = 0;
  var todayCount = 0;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][COL.id]) === u.id) return {ok:true, id:u.id}; // 重送
    if (String(rows[i][COL.deviceId]) === u.deviceId) mine++;
    if (rows[i][COL.at] instanceof Date && day_(rows[i][COL.at]) === today) todayCount++;
  }
  if (mine >= MAX_UPLOADS_PER_DEVICE) fail_('每人最多上傳 ' + MAX_UPLOADS_PER_DEVICE + ' 張喔！');
  if (todayCount >= MAX_UPLOADS_PER_DAY) fail_('今天上傳的人太多了，明天再來吧！');
  var cache = CacheService.getScriptCache();
  if (cache.get('upload:' + u.deviceId)) fail_('上傳太快了，休息一下再試。');

  var folder = DriveApp.getFolderById(prop_('FOLDER_ID'));
  var full = folder.createFile(Utilities.newBlob(u.image, 'image/jpeg', u.id + '.jpg'));
  var small = folder.createFile(Utilities.newBlob(u.thumb, 'image/jpeg', u.id + '-s.jpg'));
  if (prop_('SHARING_OK') === 'true') {
    // 檔案 ID 只有通過審核後才會給台灣島，所以先設成知道連結的人都能看也不會外流
    full.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    small.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  }
  var target = sheet.getLastRow() + 1;
  if (target > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 100);
  write_(sheet.getRange(target, 1, 1, HEADERS.length),
    [u.id, new Date(), u.deviceId, u.nickname, u.shoe, u.text, full.getId(), small.getId(), false, false, 0, u.version]);
  sheet.getRange(target, COL.approved + 1, 1, 2).insertCheckboxes();
  SpreadsheetApp.flush();
  cache.put('upload:' + u.deviceId, '1', UPLOAD_COOLDOWN_SECONDS);
  return {ok:true, id:u.id};
}


/* ---------- 投票 ---------- */

function vote_(deviceId, photoId) {
  if (!/^[A-Za-z0-9-]{16,64}$/.test(photoId)) fail_('找不到這張照片。');
  var sheet = sheet_(SHEET_NAME);
  var rows = rows_(sheet, HEADERS.length);
  var index = -1;
  for (var i = 0; i < rows.length; i++) if (String(rows[i][COL.id]) === photoId) { index = i; break; }
  if (index === -1 || rows[index][COL.approved] !== true || rows[index][COL.hidden] === true) fail_('找不到這張照片，可能已經拿掉了。');

  // 今天的投票紀錄從最後一列往回看（紀錄照時間排），看到不是今天的就停
  var today = day_(new Date());
  var log = sheet_(VOTE_SHEET);
  var last = log.getLastRow();
  var mineToday = 0;
  if (last > 1) {
    var start = Math.max(2, last - 3000);
    var recent = log.getRange(start, 1, last - start + 1, VOTE_HEADERS.length).getValues();
    for (var k = recent.length - 1; k >= 0; k--) {
      // 「日期」欄寫進去的是文字，但試算表會自動轉成日期，讀回來兩種都要認得
      var day = recent[k][3] instanceof Date ? day_(recent[k][3]) : String(recent[k][3]);
      if (day !== today) break;
      if (String(recent[k][2]) !== deviceId) continue;
      if (String(recent[k][1]) === photoId) fail_('今天已經投過這張了，明天再來！');
      mineToday++;
    }
  }
  if (mineToday >= MAX_VOTES_PER_DAY) fail_('今天投太多票了，明天再來！');

  var votes = (Number(rows[index][COL.votes]) || 0) + 1;
  log.appendRow([new Date(), photoId, deviceId, today]);
  sheet.getRange(index + 2, COL.votes + 1).setValue(votes);
  bump_();
  return {ok:true, votes:votes};
}


/* ---------- 讀取 ---------- */

/** 已通過、沒隱藏的照片（快取 1 分鐘；有人投票就換新版本號）。 */
function list_() {
  var cache = CacheService.getScriptCache();
  var key = 'list:' + (cache.get('version') || '0');
  var cached = cache.get(key);
  if (cached) return JSON.parse(cached);
  var photos = rows_(sheet_(SHEET_NAME), HEADERS.length)
    .filter(function (r) { return r[COL.approved] === true && r[COL.hidden] !== true && r[COL.at] instanceof Date; })
    .map(function (r) {
      return {
        id:String(r[COL.id]), nickname:String(r[COL.nickname] || DEFAULT_NICKNAME), shoe:String(r[COL.shoe] || ''), text:String(r[COL.text] || ''),
        votes:Number(r[COL.votes]) || 0, at:Utilities.formatDate(r[COL.at], TIME_ZONE, "yyyy-MM-dd'T'HH:mm:ssXXX"),
        full:String(r[COL.full]), thumb:String(r[COL.thumb])
      };
    })
    .sort(function (a, b) { return b.votes - a.votes || (a.at < b.at ? -1 : 1); });
  var result = {ok:true, sharing:prop_('SHARING_OK') === 'true', photos:photos};
  try { cache.put(key, JSON.stringify(result), LIST_CACHE_SECONDS); } catch (_) { /* 太大放不進快取就每次讀 */ }
  return result;
}

/** 客人自己上傳的照片審核到哪了（最多問 5 張）。 */
function status_(value) {
  var ids = value.split(',').slice(0, 5).filter(function (id) { return /^[A-Za-z0-9-]{16,64}$/.test(id); });
  var status = {};
  if (!ids.length) return {ok:true, status:status};
  rows_(sheet_(SHEET_NAME), HEADERS.length).forEach(function (r) {
    var id = String(r[COL.id]);
    if (ids.indexOf(id) === -1) return;
    status[id] = r[COL.hidden] === true ? 'hidden' : r[COL.approved] === true ? 'approved' : 'pending';
  });
  return {ok:true, status:status};
}

/** 照片內容（Drive 不能公開連結時用）：只給已通過的照片。小圖快取 6 小時。 */
function photo_(id, size) {
  var cache = CacheService.getScriptCache();
  var key = 'img:' + size + ':' + id;
  var cached = size === 'thumb' ? cache.get(key) : null;
  if (cached) return {ok:true, data:cached};
  var row = rows_(sheet_(SHEET_NAME), HEADERS.length).filter(function (r) { return String(r[COL.id]) === id; })[0];
  if (!row || row[COL.approved] !== true || row[COL.hidden] === true) fail_('找不到這張照片。');
  var bytes = DriveApp.getFileById(String(row[size === 'full' ? COL.full : COL.thumb])).getBlob().getBytes();
  var data = 'data:image/jpeg;base64,' + Utilities.base64Encode(bytes);
  if (size === 'thumb') { try { cache.put(key, data, 21600); } catch (_) { /* 放不下就算了 */ } }
  return {ok:true, data:data};
}


/* ---------- 審核頁 ---------- */

/** 密鑰對了才給看；錯了只回一行字，不透露任何東西。 */
function adminOk_(key) {
  var real = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY') || '';
  return Boolean(real) && typeof key === 'string' && key.length === real.length && key === real;
}

function adminPage_(key) {
  if (!adminOk_(key)) return HtmlService.createHtmlOutput('<p style="font:16px sans-serif;padding:24px">這個網址沒有權限。</p>');
  var html = ADMIN_HTML.replace('__KEY__', JSON.stringify(key));
  return HtmlService.createHtmlOutput(html)
    .setTitle('伸展台審核')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** 審核頁的照片清單：tab 是 pending（待審核）、approved（已上牆）或 hidden（不通過／拿掉）。小圖直接帶 base64。 */
function adminList(key, tab) {
  if (!adminOk_(key)) fail_('沒有權限。');
  var rows = rows_(sheet_(SHEET_NAME), HEADERS.length);
  var counts = {pending:0, approved:0, hidden:0};
  var picked = [];
  rows.forEach(function (r) {
    if (!r[COL.id]) return;
    var state = r[COL.hidden] === true ? 'hidden' : r[COL.approved] === true ? 'approved' : 'pending';
    counts[state]++;
    if (state === tab) picked.push(r);
  });
  // 待審核由舊到新（先上傳的先審），其他由新到舊；一次最多 40 張
  if (tab !== 'pending') picked.reverse();
  var photos = picked.slice(0, 40).map(function (r) {
    var data = '';
    try { data = 'data:image/jpeg;base64,' + Utilities.base64Encode(DriveApp.getFileById(String(r[COL.thumb])).getBlob().getBytes()); } catch (_) { data = ''; }
    return {
      id:String(r[COL.id]), nickname:String(r[COL.nickname] || ''), shoe:String(r[COL.shoe] || ''), text:String(r[COL.text] || ''),
      votes:Number(r[COL.votes]) || 0, at:r[COL.at] instanceof Date ? Utilities.formatDate(r[COL.at], TIME_ZONE, 'MM/dd HH:mm') : '', thumb:data
    };
  });
  return {counts:counts, photos:photos};
}

/** 看大圖。 */
function adminPhoto(key, id) {
  if (!adminOk_(key)) fail_('沒有權限。');
  var row = rows_(sheet_(SHEET_NAME), HEADERS.length).filter(function (r) { return String(r[COL.id]) === id; })[0];
  if (!row) fail_('找不到這張照片。');
  return 'data:image/jpeg;base64,' + Utilities.base64Encode(DriveApp.getFileById(String(row[COL.full])).getBlob().getBytes());
}

/** 審核：approve 通過（上牆）、reject 不通過（勾隱藏）、reset 回到待審核。 */
function adminReview(key, id, action) {
  if (!adminOk_(key)) fail_('沒有權限。');
  var flags = {approve:[true, false], reject:[false, true], reset:[false, false]}[action];
  if (!flags) fail_('不認得這個動作。');
  var sheet = sheet_(SHEET_NAME);
  var rows = rows_(sheet, HEADERS.length);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][COL.id]) !== id) continue;
    sheet.getRange(i + 2, COL.approved + 1, 1, 2).setValues([flags]);
    bump_();
    return true;
  }
  fail_('找不到這張照片。');
}

var ADMIN_HTML = [
  '<!doctype html><html><head><meta charset="utf-8"><style>',
  'body{margin:0;font:15px/1.5 "Noto Sans TC",system-ui,sans-serif;background:#faf6f1;color:#3c2828}',
  'header{position:sticky;top:0;z-index:2;padding:14px 16px 10px;background:#8b2332;color:#fff}',
  'h1{margin:0 0 4px;font-size:19px}header p{margin:0;font-size:13px;opacity:.9}',
  'nav{display:flex;gap:8px;margin-top:10px}nav button{flex:1;height:36px;border:0;border-radius:10px;background:rgba(255,255,255,.18);color:#fff;font:inherit;font-weight:700}',
  'nav button.on{background:#fff;color:#8b2332}',
  'main{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px;padding:16px}',
  '.card{overflow:hidden;border-radius:14px;background:#fff;box-shadow:0 2px 10px rgba(60,30,30,.12)}',
  '.card img{display:block;width:100%;aspect-ratio:3/4;object-fit:cover;background:#eee;cursor:zoom-in}',
  '.info{padding:10px 12px 4px;font-size:14px}.info b{font-size:15px}.info small{color:#8a7b78}',
  '.acts{display:flex;gap:8px;padding:8px 12px 12px}.acts button{flex:1;height:40px;border:0;border-radius:10px;font:inherit;font-weight:700;white-space:nowrap}',
  '.ok{background:#2f8a57;color:#fff}.no{background:#eee;color:#5a4a48}.reset{background:#fff;border:1px solid #ccc!important;color:#5a4a48}',
  '.empty{grid-column:1/-1;padding:40px;text-align:center;color:#8a7b78}',
  '#zoom{position:fixed;inset:0;z-index:5;display:none;place-items:center;background:rgba(0,0,0,.85)}#zoom img{max-width:96vw;max-height:92vh}',
  '</style></head><body>',
  '<header><h1>伸展台審核</h1><p>照片裡看得到 DK 的鞋、內容沒問題才按「通過」，最慢 1 分鐘出現在島上。點照片看大圖。</p>',
  '<nav><button data-tab="pending" class="on">待審核</button><button data-tab="approved">已上牆</button><button data-tab="hidden">不通過</button></nav></header>',
  '<main id="list"><p class="empty">讀取中…</p></main><div id="zoom"><img alt=""></div>',
  '<script>',
  'var KEY=__KEY__,tab="pending",list=document.getElementById("list"),zoom=document.getElementById("zoom");',
  'var NAMES={pending:"待審核",approved:"已上牆",hidden:"不通過"};',
  'function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e}',
  'function load(){list.innerHTML="<p class=empty>讀取中…</p>";google.script.run.withSuccessHandler(show).withFailureHandler(oops).adminList(KEY,tab)}',
  'function oops(e){list.innerHTML="";list.append(el("p","empty","出錯了："+(e&&e.message||e)))}',
  'function show(res){document.querySelectorAll("nav button").forEach(function(b){b.textContent=NAMES[b.dataset.tab]+"（"+res.counts[b.dataset.tab]+"）"});',
  ' list.innerHTML="";if(!res.photos.length){list.append(el("p","empty",tab==="pending"?"沒有待審核的照片 🎉":"沒有照片"));return}',
  ' res.photos.forEach(function(p){var c=el("div","card"),img=el("img");img.src=p.thumb;img.onclick=function(){big(p.id)};',
  '  var info=el("div","info");info.append(el("b",null,p.nickname),el("br"));if(p.shoe)info.append("穿 "+p.shoe,el("br"));if(p.text)info.append("「"+p.text+"」",el("br"));',
  '  info.append(el("small",null,p.at+(tab==="approved"?"・"+p.votes+" 票":"")));var a=el("div","acts");',
  '  var btns=tab==="pending"?[["通過","ok","approve"],["不通過","no","reject"]]:tab==="approved"?[["拿掉","no","reject"]]:[["改成通過","ok","approve"],["回待審核","reset","reset"]];',
  '  btns.forEach(function(b){var x=el("button",b[1],b[0]);x.onclick=function(){x.disabled=true;google.script.run.withSuccessHandler(function(){c.remove();load()}).withFailureHandler(function(e){x.disabled=false;alert(e.message||e)}).adminReview(KEY,p.id,b[2])};a.append(x)});',
  '  c.append(img,info,a);list.append(c)})}',
  'function big(id){zoom.style.display="grid";zoom.firstChild.src="";google.script.run.withSuccessHandler(function(d){zoom.firstChild.src=d}).adminPhoto(KEY,id)}',
  'zoom.onclick=function(){zoom.style.display="none"};',
  'document.querySelectorAll("nav button").forEach(function(b){b.onclick=function(){tab=b.dataset.tab;document.querySelectorAll("nav button").forEach(function(x){x.classList.toggle("on",x===b)});load()}});',
  'load();',
  '</script></body></html>'
].join('\n');


/* ---------- 小工具 ---------- */

/** 公開文字：去掉看不見的字元，依序檢查網址、程式碼、聯絡方式、冒充客服、暱稱字樣、髒話與字數。 */
function publicText_(value, label, max, isNickname) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') fail_('請檢查「' + label + '」的格式。');
  var text = value.replace(INVISIBLE_CHARS, '').replace(/\s{2,}/g, ' ').trim();
  if (!text) return '';
  var check = text.normalize('NFKC');
  TEXT_RULES.forEach(function (rule) { if (rule[0].test(check)) fail_(rule[1]); });
  if (isNickname && NICKNAME_RULE[0].test(check)) fail_(NICKNAME_RULE[1]);
  if (SCAM_RULE[0].test(check.toLowerCase().replace(SCAM_HARMLESS, '').replace(SQUASH, ''))) fail_(SCAM_RULE[1]);
  var squashed = check.toLowerCase().replace(SQUASH, '');
  if (BANNED_WORDS.some(function (word) { return squashed.indexOf(word) !== -1; })) fail_('有不適當的字，換個說法吧！');
  if (Array.from(text).length > max) fail_('「' + label + '」最多 ' + max + ' 字。');
  return text;
}

function sheet_(name) {
  var sheet = SpreadsheetApp.openById(prop_('SPREADSHEET_ID')).getSheetByName(name);
  if (!sheet) throw new Error('找不到「' + name + '」分頁，請重新執行 setup。');
  return sheet;
}

function prop_(name) {
  var value = PropertiesService.getScriptProperties().getProperty(name);
  if (!value) throw new Error('還沒設定：請在編輯器選 setup 再按「執行」。');
  return value;
}

function rows_(sheet, width) {
  var last = sheet.getLastRow();
  return last > 1 ? sheet.getRange(2, 1, last - 1, width).getValues() : [];
}

function day_(date) {
  return Utilities.formatDate(date, TIME_ZONE, 'yyyy-MM-dd');
}

function bump_() {
  CacheService.getScriptCache().put('version', String(Date.now()), 21600);
}

/** 寫一列：文字欄先設成純文字格式（避免被試算表自動轉格式），日期、數字、勾選照原樣。 */
function write_(range, values) {
  for (var i = 0; i < values.length; i++) {
    var cell = range.getCell(1, i + 1);
    var v = values[i];
    if (typeof v === 'string') cell.setNumberFormat('@');
    else if (v instanceof Date) cell.setNumberFormat('yyyy-mm-dd hh:mm:ss');
    cell.setValue(v);
  }
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function fail_(message) {
  var error = new Error(message);
  error.publicMessage = message;
  throw error;
}
