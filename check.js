// ===============================================
// data.js 검사기
// 사용법: node check.js
//   1) 개수: 기본 9개, 불가피하면 5개까지 (분야마다 0~4개)
//      9개보다 적으면 SHORT_REASON(왜 못 채웠는지)이 꼭 있어야 해요.
//   2) 품질 기준: 종합 점수 65점 이상(75점 이상 우선), 기사 날짜가 3일 이내인지
//   3) why(왜 읽어야 하나)가 있는지
//   4) rank(네이버·다음·네이트 실제 인기 순위 근거)가 없으면 조회수 점수를 70점 넘게 못 줘요
//   5) 전날 기사와 겹치지 않는지 (같은 기사 주소 / 비슷한 제목)
//      비슷한 제목이라도 followup(어제와 달라진 점)이 있으면 새 진전으로 보고 통과시켜요.
// 문제가 있으면 이유를 출력하고 실패(종료 코드 1)로 끝나요.
// ===============================================
const fs = require("fs");
const { execSync } = require("child_process");

function load(code) {
  return new Function(code + ";return { date: NEWS_DATE, news: NEWS, shortReason: typeof SHORT_REASON === \"undefined\" ? \"\" : SHORT_REASON };")();
}

// 기사 주소를 '사이트 + 기사 번호'로 바꿔요.
// (같은 기사가 주소 모양만 다르게 나오는 경우도 잡기 위해서예요)
function articleKey(url) {
  const u = new URL(url);
  const host = u.hostname.replace(/^((www|m|v|n|news|biz)\.)+/, "");
  // 주소를 조각내서 숫자가 5개 이상 들어간 가장 긴 조각을 기사 번호로 써요
  // (예: 네이트 "20261020n21459"는 통째로 하나의 번호예요)
  const parts = (u.pathname + "/" + u.search).split(/[^0-9A-Za-z]+/)
    .filter((p) => (p.match(/\d/g) || []).length >= 5);
  const id = parts.length ? parts.sort((a, b) => b.length - a.length)[0] : u.pathname.replace(/\/+$/, "");
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
const MIN_SCORE = 65;         // 종합 점수 최소 기준 (75점 이상으로 먼저 채우고, 모자라면 65~74점으로 채워요)
const MAX_AGE_DAYS = 3;       // NEWS_DATE보다 며칠까지 지난 기사를 허용할지
const TOTAL_MIN = 5, TOTAL_MAX = 9; // 기본 9개, 불가피할 때만 5개까지
const CAT_MAX = 4;
const NO_RANK_VIEWS_MAX = 70; // 인기 순위 근거가 없으면 조회수 점수 상한

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
cur.news.forEach((n) => {
  if (!(n.category in count)) errors.push(`category가 이상해요(${n.category}): "${n.title}"`);
  count[n.category] = (count[n.category] || 0) + 1;
});
if (cur.news.length < TOTAL_MIN || cur.news.length > TOTAL_MAX) {
  errors.push(`기사가 ${cur.news.length}개예요. ${TOTAL_MIN}~${TOTAL_MAX}개여야 해요.`);
}
if (cur.news.length < TOTAL_MAX && !String(cur.shortReason).trim()) {
  errors.push(`기사가 ${cur.news.length}개예요. 기본은 ${TOTAL_MAX}개예요. 65~74점 후보까지 찾아서 채우고, 정말 불가피하면 SHORT_REASON에 이유를 써요.`);
}
if (cur.news.length === TOTAL_MAX && String(cur.shortReason).trim()) {
  errors.push(`9개를 채웠으니 SHORT_REASON은 지워요.`);
}
for (const k of Object.keys(count)) {
  if (count[k] > CAT_MAX) errors.push(`${k} 기사가 ${count[k]}개예요. 분야마다 ${CAT_MAX}개까지예요.`);
}

// 2)~4) 기사마다 품질 확인
const today = new Date(cur.date + "T00:00:00Z");
cur.news.forEach((n) => {
  const t = totalScore(n);
  if (t < MIN_SCORE) errors.push(`종합 점수가 ${t}점이에요(${MIN_SCORE}점 이상이어야 해요): "${n.title}"`);

  if (!n.why || n.why.trim().length < 10) errors.push(`why(왜 읽어야 하나)가 없거나 너무 짧아요: "${n.title}"`);

  const hasRank = typeof n.rank === "string" && n.rank.trim().length > 0;
  if (!hasRank && n.views > NO_RANK_VIEWS_MAX) {
    errors.push(`인기 순위 근거(rank)가 없는데 조회수 점수가 ${n.views}점이에요(${NO_RANK_VIEWS_MAX}점까지만 가능): "${n.title}"`);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(n.date || "")) {
    errors.push(`date(기사 날짜, YYYY-MM-DD)가 없어요: "${n.title}"`);
    return;
  }
  const age = Math.round((today - new Date(n.date + "T00:00:00Z")) / 86400000);
  if (age > MAX_AGE_DAYS) errors.push(`${age}일 전 기사예요(${MAX_AGE_DAYS}일 이내여야 해요): "${n.title}"`);
  if (age < 0) errors.push(`기사 날짜(${n.date})가 NEWS_DATE보다 뒤예요: "${n.title}"`);
});

// 오늘 기사끼리도 겹치면 안 돼요
const todayKeys = new Map();
cur.news.forEach((n) => {
  const k = articleKey(n.url);
  if (todayKeys.has(k)) errors.push(`오늘 기사끼리 같은 기사예요: "${n.title}" / "${todayKeys.get(k)}"`);
  todayKeys.set(k, n.title);
});

// 5) 전날과 겹치는지 확인
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
if (cur.shortReason) console.log(`ℹ️ ${cur.news.length}개만 넣은 이유: ${cur.shortReason}`);
console.log(`✅ 검사 통과 (${cur.date}, ${cur.news.length}개${prev ? `, 전날 ${prev.date}과 중복 없음` : ""})`);
