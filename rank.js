// ===============================================
// 실시간 인기 순위 모으기
// 사용법: node rank.js
//   네이버 '많이 본 뉴스', 네이트 '많이 본 뉴스'(전체·정치·경제), 다음 '실시간 트렌드'를
//   한 번에 가져와서 화면에 보여줘요. 기사를 고를 때 '실제로 많이 읽힌 기사'의 근거로 써요.
// ===============================================

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

// 페이지를 받아와요. 한글 인코딩(UTF-8 / EUC-KR)은 알아서 맞춰요.
async function getText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  const utf8 = new TextDecoder("utf-8").decode(buf);
  const broken = (utf8.match(/�/g) || []).length;
  return broken > 20 ? new TextDecoder("euc-kr").decode(buf) : utf8;
}

function clean(s) {
  return s.replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
}

// 네이버: 언론사별 많이 본 뉴스 (언론사마다 1~5위)
async function naver() {
  const html = await getText("https://news.naver.com/main/ranking/popularDay.naver");
  const out = [];
  const boxes = html.split('class="rankingnews_box"').slice(1);
  for (const box of boxes) {
    const press = clean((box.match(/class="rankingnews_name"[^>]*>([\s\S]*?)<\/strong>/) || [])[1] || "");
    const re = /<a href="([^"]+)" class="list_title[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
    let m, rank = 0;
    while ((m = re.exec(box))) out.push({ rank: ++rank, press, title: clean(m[2]), url: m[1] });
  }
  return out;
}

// 네이트: 많이 본 뉴스 (순위 숫자가 붙은 기사만 모아요)
async function nate(sc) {
  const html = await getText(`https://news.nate.com/rank/interest?sc=${sc}`);
  const found = new Map();
  const re = /<a href="((?:https?:)?\/\/news\.nate\.com\/view\/[^"]+)"[^>]*>\s*(?:<[^>]+>\s*)*?<(h2|strong)[^>]*>([\s\S]*?)<\/\2>/g;
  let m;
  while ((m = re.exec(html))) {
    const before = html.slice(Math.max(0, m.index - 600), m.index);
    const r = [...before.matchAll(/mduRank rank(\d+)|<em>(\d+)<\/em>|class="num[^"]*"[^>]*>(\d+)</g)].pop();
    if (!r) continue;
    const rank = Number(r[1] || r[2] || r[3]);
    const url = (m[1].startsWith("//") ? "https:" + m[1] : m[1]).split("?")[0];
    if (!found.has(rank)) found.set(rank, { rank, title: clean(m[3]), url });
  }
  return [...found.values()].sort((a, b) => a.rank - b.rank);
}

// 다음: 뉴스 첫 화면의 실시간 트렌드 키워드
async function daum() {
  const html = await getText("https://news.daum.net/");
  const out = [];
  const re = /class="item_trendranking"[^>]*data-tiara-copy="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) out.push({ rank: out.length + 1, keyword: clean(m[1]) });
  if (out.length === 0) {
    const re2 = /data-tiara-copy="([^"]+)"[^>]*data-tiara-ordnum="(\d+)"/g;
    while ((m = re2.exec(html))) out.push({ rank: Number(m[2]), keyword: clean(m[1]) });
  }
  return out;
}

async function section(name, fn, print) {
  try {
    const list = await fn();
    console.log(`\n### ${name} (${list.length}개)`);
    if (list.length === 0) console.log("(목록을 찾지 못했어요. 사이트 구조가 바뀌었을 수 있어요. WebFetch로 직접 확인하세요.)");
    list.forEach(print);
  } catch (e) {
    console.log(`\n### ${name} — 가져오기 실패: ${e.message} (WebFetch로 직접 확인하세요)`);
  }
}

(async () => {
  console.log(`인기 순위 수집 시각: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`);
  await section("네이버 많이 본 뉴스 (언론사별 순위)", naver, (n) => console.log(`${n.press} ${n.rank}위 | ${n.title} | ${n.url}`));
  await section("네이트 많이 본 뉴스 - 전체", () => nate("all"), (n) => console.log(`${n.rank}위 | ${n.title} | ${n.url}`));
  await section("네이트 많이 본 뉴스 - 정치", () => nate("pol"), (n) => console.log(`${n.rank}위 | ${n.title} | ${n.url}`));
  await section("네이트 많이 본 뉴스 - 경제", () => nate("eco"), (n) => console.log(`${n.rank}위 | ${n.title} | ${n.url}`));
  await section("다음 실시간 트렌드 키워드", daum, (n) => console.log(`${n.rank}위 | ${n.keyword}`));
})();
