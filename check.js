// ===============================================
// data.js 검사기
// 사용법: node check.js
//   1) 9개(정치·부동산·경제 3개씩)인지
//   2) 전날 기사와 겹치지 않는지 (같은 기사 주소 / 비슷한 제목)
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
  if (count[k] !== 3) errors.push(`${k} 기사가 ${count[k]}개예요. 3개여야 해요.`);
}

// 오늘 9개끼리도 겹치면 안 돼요
const todayKeys = new Map();
cur.news.forEach((n) => {
  const k = articleKey(n.url);
  if (todayKeys.has(k)) errors.push(`오늘 기사끼리 같은 기사예요: "${n.title}" / "${todayKeys.get(k)}"`);
  todayKeys.set(k, n.title);
});

// 2) 전날과 겹치는지 확인
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
      if (s >= SIMILAR_LIMIT) {
        errors.push(`전날(${prev.date}) 기사와 제목이 비슷해요(${Math.round(s * 100)}%): "${n.title}" ↔ "${p.title}"`);
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
