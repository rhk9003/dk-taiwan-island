/**
 * DK 台灣島｜島民證（Google Apps Script 獨立專案）
 *
 * 客人換手機或清掉瀏覽器資料時，用 6 碼島民證把自己的島民接回來。
 * 跟「店長的話蒐集」的收件程式分開：自己的排隊鎖、自己的試算表，不跟留言、存島民搶。
 *
 *   setup   第一次使用時在編輯器上方選它再按「執行」：建立「DK 台灣島 島民證」試算表（ID 記在指令碼屬性），
 *           執行紀錄會印出試算表網址。之後重跑也安全，不會刪掉任何紀錄。
 *   doPost  台灣島送來的要求（text/plain 的 JSON）：
 *     { role: "issue", deviceId, resident: {id, look, mode, nickname, since} }
 *        → 這台裝置的島民證（還沒有就發一組），順便更新島民快照 → {ok:true, code:"ABC234"}
 *     { role: "reclaim", deviceId, code }
 *        → 用號碼找回 → {ok:true, deviceId:"原本的裝置代號", code, resident:{…快照} 或 null}
 *          台灣島改用回傳的裝置代號，就變回原本那個島民。
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
// 號碼不用 0/O、1/I/L 這些容易看錯的字
var CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
var CODE_LENGTH = 6;
var FAIL_WINDOW_SECONDS = 600;
var DEVICE_FAIL_LIMIT = 8;
var GLOBAL_FAIL_LIMIT = 120;


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
    var deviceId = typeof data.deviceId === 'string' ? data.deviceId : '';
    if (!/^[A-Za-z0-9_-]{16,40}$/.test(deviceId)) fail_('裝置識別碼不正確，請重新整理後再試。');
    // 找回只有讀資料，不用排隊等鎖
    if (data.role === 'reclaim') return json_(reclaim_(deviceId, data.code));
    if (data.role !== 'issue') fail_('不認得這個要求，請重新整理後再試。');
    lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) fail_('目前比較忙，請稍後再試。');
    return json_(issue_(deviceId, data.resident));
  } catch (error) {
    if (!error.publicMessage) console.error(error);
    return json_({ok:false, message:error.publicMessage || '暫時連不上島民證，請稍後再試。'});
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
}


/* ---------- 發證、找回 ---------- */

/** 這台裝置的島民證：已經有就更新快照、回同一組號碼；沒有就發一組不重複的新號碼。 */
function issue_(deviceId, resident) {
  var sheet = sheet_();
  var rows = rows_(sheet);
  var snapshot = snapshotOf_(resident);
  var now = new Date();
  var used = {};
  for (var i = rows.length - 1; i >= 0; i--) {
    if (String(rows[i][COL.deviceId]) === deviceId && rows[i][COL.disabled] !== true) {
      write_(sheet.getRange(i + 2, COL.id + 1, 1, 3), [snapshot.id, snapshot.json, null]);
      write_(sheet.getRange(i + 2, COL.updatedAt + 1, 1, 1), [now]);
      return {ok:true, code:String(rows[i][COL.code])};
    }
  }
  for (var k = 0; k < rows.length; k++) used[String(rows[k][COL.code])] = true;
  var code;
  do {
    code = '';
    for (var c = 0; c < CODE_LENGTH; c++) code += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
  } while (used[code]);
  var target = sheet.getLastRow() + 1;
  if (target > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 100);
  write_(sheet.getRange(target, 1, 1, COL.reclaims + 1), [code, deviceId, snapshot.id, snapshot.json, now, now, 0]);
  sheet.getRange(target, COL.disabled + 1).insertCheckboxes();
  SpreadsheetApp.flush();
  return {ok:true, code:code};
}

/** 用號碼找回：回傳原本的裝置代號和島民快照。猜錯太多次先擋 10 分鐘。 */
function reclaim_(deviceId, value) {
  var code = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  var pattern = new RegExp('^[' + CODE_CHARS + ']{' + CODE_LENGTH + '}$');
  if (!pattern.test(code)) fail_('島民證是 ' + CODE_LENGTH + ' 個英文字母和數字，請再確認一次。');
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
