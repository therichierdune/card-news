// ===============================================
// data.js 검사기
// 사용법: node check.js
//   1) 9개(정치·부동산·경제 분야마다 2~4개)인지
//   2) 품질 기준: 종합 점수 65점 이상, 기사 날짜가 3일 이내인지
//   3) 전날 기사와 겹치지 않는지 (같은 기사 주소 / 비슷한 제목)
//      비슷한 제목이라도 followup(어제와 달라진 점)이 있으면 새 진전으로 보고 통과시켜요.
// 문제가 있으면 이유를 출력하고 실패(종료 코드 1)로 끝나요.
// ===============================================
const fs = require("fs");
const { execSync } = require("child_process");

function load(code) {
  return new Function(code + ";return { date: NEWS_DATE, news: NEWS };")();
}

// 기사 주소를 '사이트 + 기사 번호'로 바꿔요.
// (같은 기사가 주소 모양만 다르게 나오는 경우도 잡기 위해서예요)
function articleKey(url) {
  const u = new URL(url);
  const host = u.hostname.replace(/^(www|m|v|news|biz)\./, "");
  const ids = (u.pathname + u.search).match(/\d{5,}/g);
  const id = ids ? ids.sort((a, b) => b.length - a.length)[0] : u.pathname.replace(/\/+$/, "");
  return host + "|" + id;
}

// 제목을 두 글자씩 잘라서 얼마나 겹치는지(0~1) 계산해요
function bigrams(text) {
  const s = text.replace(/[^0-9a-zA-Z가-힣]/g, "");
  const set = new Set();
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
  return set;
}
function similarity(a, b) {
  const A = bigrams(a), B = bigrams(b);
  let same = 0;
  A.forEach((x) => { if (B.has(x)) same++; });
  return same / Math.min(A.size, B.size);
}
const SIMILAR_LIMIT = 0.5;
const MIN_SCORE = 65;   // 종합 점수 최소 기준
const MAX_AGE_DAYS = 3; // NEWS_DATE보다 며칠까지 지난 기사를 허용할지
const CAT_MIN = 2, CAT_MAX = 4;

// script.js와 똑같이 세 점수의 평균을 내요
function totalScore(n) {
  return Math.round((n.views + n.issue + n.interest) / 3);
}

// 날짜가 다른 가장 최근 data.js(= 전날 것)를 git 기록에서 찾아요
function previousData(today) {
  let commits = [];
  try {
    commits = execSync("git log --format=%H -n 30 -- data.js", { encoding: "utf8" }).trim().split("\n").filter(Boolean);
  } catch (e) { return null; }
  for (const c of commits) {
    try {
      const old = load(execSync(`git show ${c}:data.js`, { encoding: "utf8" }));
      if (old.date !== today) return old;
    } catch (e) { /* 그 시점 파일이 깨져 있으면 건너뛰어요 */ }
  }
  return null;
}

const errors = [];
const cur = load(fs.readFileSync("data.js", "utf8"));

// 1) 개수 확인
const count = { politics: 0, realestate: 0, economy: 0 };
cur.news.forEach((n) => { count[n.category] = (count[n.category] || 0) + 1; });
if (cur.news.length !== 9) errors.push(`기사가 ${cur.news.length}개예요. 9개여야 해요.`);
for (const k of Object.keys(count)) {
  if (count[k] < CAT_MIN || count[k] > CAT_MAX) errors.push(`${k} 기사가 ${count[k]}개예요. ${CAT_MIN}~${CAT_MAX}개여야 해요.`);
}

// 2) 품질 기준
const today = new Date(cur.date + "T00:00:00Z");
cur.news.forEach((n) => {
  const t = totalScore(n);
  if (t < MIN_SCORE) errors.push(`종합 점수가 ${t}점이에요(${MIN_SCORE}점 이상이어야 해요): "${n.title}"`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(n.date || "")) {
    errors.push(`date(기사 날짜, YYYY-MM-DD)가 없어요: "${n.title}"`);
    return;
  }
  const age = Math.round((today - new Date(n.date + "T00:00:00Z")) / 86400000);
  if (age > MAX_AGE_DAYS) errors.push(`${age}일 전 기사예요(${MAX_AGE_DAYS}일 이내여야 해요): "${n.title}"`);
  if (age < 0) errors.push(`기사 날짜(${n.date})가 NEWS_DATE보다 뒤예요: "${n.title}"`);
});

// 오늘 9개끼리도 겹치면 안 돼요
const todayKeys = new Map();
cur.news.forEach((n) => {
  const k = articleKey(n.url);
  if (todayKeys.has(k)) errors.push(`오늘 기사끼리 같은 기사예요: "${n.title}" / "${todayKeys.get(k)}"`);
  todayKeys.set(k, n.title);
});

// 3) 전날과 겹치는지 확인
let prev = previousData(cur.date);
if (!prev) {
  // 클라우드가 기록을 일부만 받아왔을 수 있어서, 더 받아온 뒤 다시 찾아요
  try { execSync("git fetch -q --deepen=30 origin", { stdio: "ignore" }); } catch (e) {}
  prev = previousData(cur.date);
}
if (!prev) {
  console.log("비교할 전날 data.js가 없어서 중복 검사는 건너뛰어요.");
} else {
  const prevKeys = new Map(prev.news.map((n) => [articleKey(n.url), n.title]));
  cur.news.forEach((n) => {
    const k = articleKey(n.url);
    if (prevKeys.has(k)) {
      errors.push(`전날(${prev.date})과 같은 기사예요: "${n.title}"`);
      return;
    }
    prev.news.forEach((p) => {
      const s = similarity(n.title, p.title);
      if (s >= SIMILAR_LIMIT && n.followup) {
        console.log(`ℹ️ 전날 이슈의 새 진전으로 통과(${Math.round(s * 100)}%): "${n.title}" — ${n.followup}`);
      } else if (s >= SIMILAR_LIMIT) {
        errors.push(`전날(${prev.date}) 기사와 제목이 비슷해요(${Math.round(s * 100)}%): "${n.title}" ↔ "${p.title}" (새 진전이면 followup을 넣어요)`);
      }
    });
  });
}

if (errors.length) {
  console.log("❌ 검사 실패");
  errors.forEach((e) => console.log(" - " + e));
  process.exit(1);
}
console.log(`✅ 검사 통과 (${cur.date}, 9개${prev ? `, 전날 ${prev.date}과 중복 없음` : ""})`);
