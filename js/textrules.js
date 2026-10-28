// 留言和暱稱不審核、直接顯示，所以送出前先擋網址、程式碼、聯絡方式。
// 店長表單的 Apps Script 用一模一樣的規則再擋一次（前端可以被繞過，後端才算數），禁用字清單只在後端。

const INVISIBLE = /[\u0000-\u001F\u007F​-‏‪-‮⁠-⁤﻿]/g;

const RULES = [
  [/(https?:|www\.|:\/\/)/i, '不能放網址喔！'],
  [/[a-z0-9-]+\s*(\.|。|點|dot)\s*(com|net|org|tw|io|cc|me|xyz|top|info|co|ly|gl|app|site|link|shop|live|tv)\b/i, '不能放網址喔！'],
  [/[<>{}[\]`\\=]/, '不能放程式碼或特殊符號（< > { } [ ] = 等）喔！'],
  [/(script|javascript:|onerror|onload|eval\(|&#|%3c)/i, '不能放程式碼或特殊符號（< > { } [ ] = 等）喔！'],
  [/@/, '不能放帳號或 email 喔！'],
  [/(\d[\s-]?){9,}/, '為了保護個資，不能留電話或一長串數字喔！'],
  [/(.)\1{9,}/u, '不要洗版喔！'],
];
const NICKNAME_RULES = [[/(官方|客服|店長|管理員|admin|staff)/i, '暱稱不能用官方、客服、店長等字樣喔！']];

/** 去掉看不見的字元，送出和顯示都用這個版本 */
export const cleanText = (text) => String(text ?? '').replace(INVISIBLE, '').trim();

/** 有問題就回傳要給客人看的提示，沒問題回傳空字串。kind 是 'message' 或 'nickname' */
export function textProblem(text, kind = 'message') {
  const check = cleanText(text).normalize('NFKC'); // 全形的 ｗｗｗ、＜、＠ 也擋得到
  if (!check) return '';
  const rules = kind === 'nickname' ? [...RULES, ...NICKNAME_RULES] : RULES;
  return rules.find(([re]) => re.test(check))?.[1] || '';
}
