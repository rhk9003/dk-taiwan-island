/**
 * DK 台灣島｜島民證（Google Apps Script 獨立專案）
 *
 * 客人換手機或清掉瀏覽器資料時，用 6 碼島民證把自己的島民接回來。
 * 跟「店長的話蒐集」的收件程式分開：自己的排隊鎖、自己的試算表，不跟留言、存島民搶。
 *
 *   setup   第一次使用時在編輯器上方選它再按「執行」：建立「DK 台灣島 島民證」和「DK 台灣島 開島紀錄」兩份試算表
 *           （ID 記在指令碼屬性），執行紀錄會印出試算表網址。之後重跑也安全，不會刪掉任何紀錄。
 *   doPost  台灣島送來的要求（text/plain 的 JSON）：
 *     { role: "issue", deviceId, code?, resident: {id, look, mode, nickname, since} }
 *        → 這台裝置的島民證（還沒有就發一組），順便更新島民快照 → {ok:true, code:"ABC234"}
 *          有帶 code 就用客人自己取的代號（6–12 個英文字母或數字、至少一個英文字母、不能跟別人重複），
 *          已經有島民證的裝置帶新的 code 就是改代號，舊的代號立刻失效。
 *     { role: "reclaim", deviceId, code }
 *        → 用號碼找回 → {ok:true, deviceId:"原本的裝置代號", code, resident:{…快照} 或 null}
 *          台灣島改用回傳的裝置代號，就變回原本那個島民。
 *     { role: "open", visitor, count, browser, device, from, entry, test }
 *        → 有人打開台灣島，在「開島紀錄」記一筆 → {ok:true}。不用島民證、不碰裝置代號；
 *          「每日統計」分頁用公式算每天開幾次、幾台裝置、從哪裡來。
 *     失敗一律回 {ok:false, message:"給客人看的說明"}。
 *   doGet   回 {ok:true, service:"dk-island-islander"}，可以用來確認服務在不在。
 *
 * 號碼就是鑰匙：拿到號碼就能改那個島民，所以試算表不要分享出去。
 * 號碼外流時，在那一列勾「停用」，那組號碼就不能再用來找回（客人重新存一次島民會拿到新號碼）。
 * 同一台裝置 10 分鐘內猜錯 8 次、或全部加起來猜錯 120 次，會先擋 10 分鐘。
 */

var SHEET_NAME = '島民證';
var HEADERS = ['島民證','裝置代號','角色ID','島民快照','發證時間','更新時間','找回次數','停用'];
var COL = {code:0, deviceId:1, id:2, snapshot:3, createdAt:4, updatedAt:5, reclaims:6, disabled:7};
var TIME_ZONE = 'Asia/Taipei';
// 系統隨機發的號碼不用 0/O、1/I/L 這些容易看錯的字
var CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
var CODE_LENGTH = 6;
// 客人自己取的代號：6–12 個英文字母或數字，至少一個英文字母（擋掉純數字的生日、電話），不分大小寫
var CUSTOM_CODE = /^(?=.*[A-Z])[A-Z0-9]{6,12}$/;
var ANY_CODE = /^[A-Z0-9]{6,12}$/;
var FAIL_WINDOW_SECONDS = 600;
var DEVICE_FAIL_LIMIT = 8;
var GLOBAL_FAIL_LIMIT = 120;
// 開島紀錄：同一位訪客 2 分鐘內重開只記一次；每 6 小時最多記 2 萬筆（被灌爆時保護試算表）
var OPEN_SHEET = '開島紀錄';
var OPEN_HEADERS = ['時間','日期','訪客','這台第幾次開','用什麼開','手機／電腦','從哪裡來','直接到'];
var OPEN_BROWSERS = ['LINE','Facebook','Messenger','Instagram','Threads','其他App','手機瀏覽器','電腦'];
var OPEN_DEVICES = ['iPhone','Android','電腦'];
var OPEN_REPEAT_SECONDS = 120;
var OPEN_LIMIT = 20000;
var SUMMARY_SHEET = '每日統計';


/* ---------- 第一次設定 ---------- */

function setup() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SPREADSHEET_ID');
  var book = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.create('DK 台灣島 島民證');
  props.setProperty('SPREADSHEET_ID', book.getId());
  book.setSpreadsheetTimeZone(TIME_ZONE);
  var sheet = book.getSheetByName(SHEET_NAME);
  if (!sheet) {
    var first = book.getSheets()[0];
    sheet = first.getLastRow() === 0 ? first.setName(SHEET_NAME) : book.insertSheet(SHEET_NAME);
  }
  var header = sheet.getRange(1, 1, 1, HEADERS.length);
  header.setValues([HEADERS]).setFontWeight('bold').setBackground('#f3e6e8');
  sheet.setFrozenRows(1);
  [90, 260, 110, 420, 150, 150, 70, 60].forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); });
  console.log('島民證試算表：' + book.getUrl());
  setupOpens_(props);
}

/** 開島紀錄放另一份試算表：裡面沒有島民證號碼，可以放心分享給同事看。 */
function setupOpens_(props) {
  var id = props.getProperty('OPENS_SPREADSHEET_ID');
  var book = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.create('DK 台灣島 開島紀錄');
  props.setProperty('OPENS_SPREADSHEET_ID', book.getId());
  book.setSpreadsheetTimeZone(TIME_ZONE);
  var log = book.getSheetByName(OPEN_SHEET);
  if (!log) {
    var first = book.getSheets()[0];
    log = first.getLastRow() === 0 ? first.setName(OPEN_SHEET) : book.insertSheet(OPEN_SHEET);
  }
  log.getRange(1, 1, 1, OPEN_HEADERS.length).setValues([OPEN_HEADERS]).setFontWeight('bold').setBackground('#f3e6e8');
  log.setFrozenRows(1);
  log.getRange('A:A').setNumberFormat('yyyy-mm-dd hh:mm:ss');
  log.getRange('B:B').setNumberFormat('yyyy-mm-dd');
  log.getRange('C:C').setNumberFormat('@');
  [150, 90, 110, 90, 90, 80, 150, 100].forEach(function (w, i) { log.setColumnWidth(i + 1, w); });

  var sum = book.getSheetByName(SUMMARY_SHEET) || book.insertSheet(SUMMARY_SHEET, 0);
  // 公式都從第 2 列算起（跳過標題列），COUNTIFS 的每個範圍要一樣大
  var R = function (col) { return "'" + OPEN_SHEET + "'!" + col + '2:' + col; };
  var real = R('G') + ', "<>測試"'; // 本機測試的不算
  var cols = [
    ['開啟次數', ''],
    ['不同裝置', 'unique'],
    ['第一次開', R('D') + ', 1'],
    ['LINE', R('E') + ', "LINE"'],
    ['Facebook', R('E') + ', "Facebook"'],
    ['Messenger', R('E') + ', "Messenger"'],
    ['Instagram', R('E') + ', "Instagram"'],
    ['Threads', R('E') + ', "Threads"'],
    ['其他App', R('E') + ', "其他App"'],
    ['手機瀏覽器', R('E') + ', "手機瀏覽器"'],
    ['電腦', R('E') + ', "電腦"'],
    ['官網文章裡', R('G') + ', "官網文章"']
  ];
  var count = function (dateCond, extra) {
    if (extra === 'unique') return 'COUNTUNIQUEIFS(' + R('C') + ', ' + dateCond + ', ' + real + ')';
    return 'COUNTIFS(' + dateCond + ', ' + real + (extra ? ', ' + extra : '') + ')';
  };
  sum.clear();
  sum.getRange(1, 1, 1, cols.length + 1).setValues([['日期'].concat(cols.map(function (c) { return c[0]; }))])
    .setFontWeight('bold').setBackground('#f3e6e8');
  // 第 2 列是開站以來的合計，第 3 列起每天一列（新的在上面）
  sum.getRange(2, 1).setValue('全部').setFontWeight('bold');
  cols.forEach(function (c, i) {
    sum.getRange(2, i + 2).setFormula('=' + count(R('B') + ', "<>"', c[1])).setFontWeight('bold');
    sum.getRange(3, i + 2).setFormula('=MAP(A3:A, LAMBDA(d, IF(d="", , ' + count(R('B') + ', d', c[1]) + ')))');
  });
  sum.getRange(3, 1).setFormula('=IFERROR(SORT(UNIQUE(FILTER(' + R('B') + ', ' + R('B') + '<>"", ' + R('G') + '<>"測試")), 1, FALSE))');
  sum.getRange('A:A').setNumberFormat('yyyy-mm-dd');
  sum.setFrozenRows(2);
  sum.setFrozenColumns(1);
  sum.setColumnWidth(1, 100);
  console.log('開島紀錄試算表：' + book.getUrl());
}


/* ---------- 網頁進入點 ---------- */

function doGet() {
  return json_({ok:true, service:'dk-island-islander'});
}

function doPost(event) {
  var lock;
  try {
    var raw = event && event.postData && event.postData.contents;
    if (!raw || raw.length > 4000) fail_('送出的內容不完整或過長。');
    var data;
    try { data = JSON.parse(raw); } catch (_) { fail_('資料格式不正確，請重新整理後再試。'); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail_('資料格式不正確，請重新整理後再試。');
    if (data.role === 'open') return json_(logOpen_(data));
    var deviceId = typeof data.deviceId === 'string' ? data.deviceId : '';
    if (!/^[A-Za-z0-9_-]{16,40}$/.test(deviceId)) fail_('裝置識別碼不正確，請重新整理後再試。');
    // 找回只有讀資料，不用排隊等鎖
    if (data.role === 'reclaim') return json_(reclaim_(deviceId, data.code));
    if (data.role !== 'issue') fail_('不認得這個要求，請重新整理後再試。');
    lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) fail_('目前比較忙，請稍後再試。');
    return json_(issue_(deviceId, data.resident, data.code));
  } catch (error) {
    if (!error.publicMessage) console.error(error);
    return json_({ok:false, message:error.publicMessage || '暫時連不上島民證，請稍後再試。'});
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
}


/* ---------- 發證、找回 ---------- */

/**
 * 這台裝置的島民證：已經有就更新快照、回同一組號碼；沒有就發一組不重複的新號碼。
 * desired 是客人自己取的代號：新島民就用它，已經有島民證的就改成它（不能跟別人重複）。
 */
function issue_(deviceId, resident, desired) {
  var wanted = desired ? normalizeCode_(desired) : '';
  if (wanted && !CUSTOM_CODE.test(wanted)) fail_('代號要 6–12 個英文字母或數字，而且至少要有一個英文字母。');
  var sheet = sheet_();
  var rows = rows_(sheet);
  var snapshot = snapshotOf_(resident);
  var now = new Date();
  var used = {};
  var mine = -1;
  for (var i = rows.length - 1; i >= 0; i--) {
    if (mine === -1 && String(rows[i][COL.deviceId]) === deviceId && rows[i][COL.disabled] !== true) mine = i;
  }
  for (var k = 0; k < rows.length; k++) if (k !== mine) used[String(rows[k][COL.code])] = true;
  if (wanted && used[wanted]) fail_('這個代號已經有人用了，換一個試試看。');
  if (mine !== -1) {
    var row = mine + 2;
    if (snapshot.json) write_(sheet.getRange(row, COL.id + 1, 1, 3), [snapshot.id, snapshot.json, null]); // 只改代號時沒帶快照，就不動原本的
    write_(sheet.getRange(row, COL.updatedAt + 1, 1, 1), [now]);
    if (wanted && wanted !== String(rows[mine][COL.code])) write_(sheet.getRange(row, COL.code + 1, 1, 1), [wanted]);
    return {ok:true, code:wanted || String(rows[mine][COL.code])};
  }
  var code = wanted;
  while (!code || used[code]) {
    code = '';
    for (var c = 0; c < CODE_LENGTH; c++) code += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
  }
  var target = sheet.getLastRow() + 1;
  if (target > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 100);
  write_(sheet.getRange(target, 1, 1, COL.reclaims + 1), [code, deviceId, snapshot.id, snapshot.json, now, now, 0]);
  sheet.getRange(target, COL.disabled + 1).insertCheckboxes();
  SpreadsheetApp.flush();
  return {ok:true, code:code};
}

/** 用號碼找回：回傳原本的裝置代號和島民快照。猜錯太多次先擋 10 分鐘。 */
function reclaim_(deviceId, value) {
  var code = normalizeCode_(value);
  if (!ANY_CODE.test(code)) fail_('島民證代號是 6–12 個英文字母或數字，請再確認一次。');
  var cache = CacheService.getScriptCache();
  var deviceKey = 'fail:' + deviceId;
  var fails = Number(cache.get(deviceKey)) || 0;
  var allFails = Number(cache.get('fail-all')) || 0;
  if (fails >= DEVICE_FAIL_LIMIT || allFails >= GLOBAL_FAIL_LIMIT) fail_('試太多次了，請 10 分鐘後再試。');

  var sheet = sheet_();
  var rows = rows_(sheet);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][COL.code]) !== code || rows[i][COL.disabled] === true) continue;
    // 找回次數只是給你看有沒有人在亂試，同時有兩個人找回少算一次也沒關係，所以不排隊
    sheet.getRange(i + 2, COL.reclaims + 1).setValue((Number(rows[i][COL.reclaims]) || 0) + 1);
    var resident = null;
    try { resident = rows[i][COL.snapshot] ? JSON.parse(String(rows[i][COL.snapshot])) : null; } catch (_) { resident = null; }
    return {ok:true, deviceId:String(rows[i][COL.deviceId]), code:code, resident:resident};
  }
  cache.put(deviceKey, String(fails + 1), FAIL_WINDOW_SECONDS);
  cache.put('fail-all', String(allFails + 1), FAIL_WINDOW_SECONDS);
  fail_('找不到這張島民證，請再確認一次號碼。');
}

/* ---------- 開島紀錄 ---------- */

/**
 * 有人打開台灣島：記一筆。欄位都先比對過固定的選項或格式，不認得的寫「其他」，
 * 試算表不會被塞進公式或奇怪的字。還沒跑 setup 就安靜略過（台灣島照常開）。
 */
function logOpen_(data) {
  var id = PropertiesService.getScriptProperties().getProperty('OPENS_SPREADSHEET_ID');
  if (!id) return {ok:true, skipped:'not-set-up'};
  var visitor = typeof data.visitor === 'string' && /^v[a-z0-9]{8,24}$/.test(data.visitor) ? data.visitor : '';
  if (!visitor) fail_('訪客代號不正確。');
  var cache = CacheService.getScriptCache();
  if (cache.get('open:' + visitor)) return {ok:true, skipped:'repeat'};
  var total = Number(cache.get('open-all')) || 0;
  if (total >= OPEN_LIMIT) return {ok:true, skipped:'limit'};
  cache.put('open:' + visitor, '1', OPEN_REPEAT_SECONDS);
  cache.put('open-all', String(total + 1), 21600);

  var pick = function (value, list) { return list.indexOf(value) !== -1 ? value : '其他'; };
  var from = String(data.from || '');
  if (data.test === true) from = '測試';
  else if (!/^(官網文章|直接開|嵌在別的網站)$/.test(from) && !/^(utm:)?[a-z0-9][a-z0-9_.-]{0,59}$/i.test(from)) from = '其他';
  var entry = String(data.entry || '');
  if (!/^[a-z][a-z0-9_-]{0,29}$/i.test(entry)) entry = '';
  var count = Math.floor(Number(data.count));
  var now = new Date();
  var day = Utilities.parseDate(Utilities.formatDate(now, TIME_ZONE, 'yyyy-MM-dd'), TIME_ZONE, 'yyyy-MM-dd');
  SpreadsheetApp.openById(id).getSheetByName(OPEN_SHEET).appendRow([
    now, day, visitor, count >= 1 && count < 1e6 ? count : '',
    pick(data.browser, OPEN_BROWSERS), pick(data.device, OPEN_DEVICES), from, entry
  ]);
  return {ok:true};
}


/** 客人輸入的代號：轉大寫、去掉空白和連字號。 */
function normalizeCode_(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** 島民快照只留固定欄位、限制長度；格式不對就不存（還是照樣發證）。 */
function snapshotOf_(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return {id:'', json:''};
  var text = function (v, max) { return typeof v === 'string' ? v.slice(0, max) : ''; };
  var look = r.look && typeof r.look === 'object' ? r.look : {};
  var id = /^[0-9a-f]{6,64}$/i.test(text(r.id, 64)) ? r.id : '';
  var clean = {
    id:id,
    look:{body:text(look.body, 8), hat:text(look.hat, 12), acc:text(look.acc, 12), shoe:text(look.shoe, 12)},
    mode:text(r.mode, 12),
    nickname:text(r.nickname, 10),
    since:text(r.since, 40)
  };
  return {id:id, json:JSON.stringify(clean)};
}


/* ---------- 小工具 ---------- */

function sheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('還沒設定：請在編輯器選 setup 再按「執行」。');
  var sheet = SpreadsheetApp.openById(id).getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('找不到「' + SHEET_NAME + '」分頁，請重新執行 setup。');
  return sheet;
}

/** 全部資料列（號碼、快照是文字；「停用」勾了是 true）。 */
function rows_(sheet) {
  var last = sheet.getLastRow();
  return last > 1 ? sheet.getRange(2, 1, last - 1, HEADERS.length).getValues() : [];
}

/** 寫一列：先設成純文字格式（日期除外），避免號碼或快照被試算表自動轉格式；null 的格子不動。 */
function write_(range, values) {
  var formats = values.map(function (v) { return v instanceof Date ? 'yyyy-mm-dd hh:mm:ss' : '@'; });
  for (var i = 0; i < values.length; i++) {
    if (values[i] === null) continue;
    var cell = range.getCell(1, i + 1);
    cell.setNumberFormat(formats[i]);
    cell.setValue(values[i]);
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
