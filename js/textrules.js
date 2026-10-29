// 留言和暱稱不審核、直接顯示，所以送出前先擋網址、程式碼、聯絡方式。
// 店長表單的 Apps Script 用一模一樣的規則再擋一次（前端可以被繞過，後端才算數），禁用字清單只在後端。
// 顯示前也用同一套規則再過一次（safeText），就算有人繞過前端直接打後端，違規的字也不會出現在島上。

const INVISIBLE = /[\u0000-\u001F\u007F​-‏‪-‮⁠-⁤﻿]/g;

const RULES = [
  [/(https?:|www\.|:\/\/)/i, '不能放網址喔！'],
  [/[a-z0-9-]+\s*(\.|。|點|dot)\s*(com|net|org|tw|io|cc|me|xyz|top|info|co|ly|gl|app|site|link|shop|live|tv)\b/i, '不能放網址喔！'],
  [/[<>{}[\]`\\=]/, '不能放程式碼或特殊符號（< > { } [ ] = 等）喔！'],
  [/(script|javascript:|onerror|onload|eval\(|&#|%3c)/i, '不能放程式碼或特殊符號（< > { } [ ] = 等）喔！'],
  [/@/, '不能放帳號或 email 喔！'],
  [/(\d[\s-]?){9,}/, '為了保護個資，不能留電話或一長串數字喔！'],
  [/(.)\1{9,}/u, '不要洗版喔！'],
  // 「加 dkcs88」「ID：abc123」這種留帳號的寫法：英文開頭又帶數字的一串，或「加」後面接英數
  [/(?<![a-z0-9])(?=[a-z0-9_.-]{4,})[a-z][a-z0-9_.-]*\d/i, '不能留聯絡方式或帳號喔！'],
  [/加\s*(?=[a-z0-9_.-]*[a-z])[a-z0-9_.-]{4,}/i, '不能留聯絡方式或帳號喔！'],
];
// 防冒充客服詐騙：去掉空白標點後比對，「加 賴」「L.I.N.E」「客-服」都擋得到
const SQUASH = /[\s\p{P}\p{S}]/gu;
const HARMLESS = /(online|deadline|airline|outline|linen)/g; // 含 line 但無害的英文字
const SCAM = /(客服|官方|公告|專員|總部|系統通知|加賴|賴id|密賴|私賴|賴我|ㄌㄞ|line|微信|wechat|telegram|whatsapp|私訊|私聊|聯繫|聯絡|來電|電話|專線|扣款|退款|退費|匯款|轉帳|帳戶|帳號|分期|定期購|信用卡|卡號|atm|驗證碼|個資|加好友|加我)/;
const SCAM_TIP = '為了防詐騙，留言不能提到客服、官方、LINE、帳戶或付款喔！有問題請找官網客服。';
const NICKNAME_RULES = [[/(官方|客服|店長|店員|門市|小編|專員|公告|總部|系統|管理員|admin|staff|dk|dr\.?kao|高博士)/i, '暱稱不能用 DK、官方、客服、門市、店長等字樣喔！']];

/** 去掉看不見的字元，送出和顯示都用這個版本 */
export const cleanText = (text) => String(text ?? '').replace(INVISIBLE, '').trim();

/** 有問題就回傳要給客人看的提示，沒問題回傳空字串。kind 是 'message' 或 'nickname' */
export function textProblem(text, kind = 'message') {
  const check = cleanText(text).normalize('NFKC'); // 全形的 ｗｗｗ、＜、＠ 也擋得到
  if (!check) return '';
  const rules = kind === 'nickname' ? [...RULES, ...NICKNAME_RULES] : RULES;
  const hit = rules.find(([re]) => re.test(check));
  if (hit) return hit[1];
  if (SCAM.test(check.toLowerCase().replace(HARMLESS, '').replace(SQUASH, ''))) return SCAM_TIP;
  return '';
}

/** 顯示用：沒問題就原樣回傳，有問題回傳空字串（呼叫的地方把那則拿掉或改成預設暱稱） */
export const safeText = (text, kind = 'message') => (textProblem(text, kind) ? '' : cleanText(text));
