// 분야 이름표
const CATEGORY_NAMES = {
  economy: "경제",
  realestate: "부동산",
  politics: "정치"
};

const METRIC_NAMES = {
  views: "조회수",
  issue: "이슈",
  interest: "여론관심도"
};

// 세 점수의 평균 = 종합 점수
function totalScore(item) {
  return Math.round((item.views + item.issue + item.interest) / 3);
}

// 날짜를 "2026년 10월 17일 (토)" 모양으로 바꿔요
function formatDate(text) {
  const d = new Date(text + "T00:00:00");
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
}

// 카드 안의 '어려운 말 풀이' (눌러서 펼쳐요)
function termsHTML(item) {
  if (!item.terms || item.terms.length === 0) return "";
  const rows = item.terms.map((t) => `<dt>${t.word}</dt><dd>${t.mean}</dd>`).join("");
  return `
    <details class="terms">
      <summary>어려운 말 풀이 <span class="count">${item.terms.length}</span></summary>
      <dl>${rows}</dl>
    </details>`;
}

// 맨 아래 '오늘의 용어 사전': 모든 카드의 용어를 겹치지 않게 모아요
function renderGlossary(list) {
  const seen = new Set();
  const rows = [];
  list.forEach((item) => {
    (item.terms || []).forEach((t) => {
      if (seen.has(t.word)) return;
      seen.add(t.word);
      rows.push(`
        <div class="gloss-item ${item.category}">
          <dt><span class="dot"></span>${t.word}</dt>
          <dd>${t.mean}</dd>
        </div>`);
    });
  });

  const box = document.getElementById("glossary");
  if (rows.length === 0) { box.hidden = true; return; }
  box.innerHTML = `
    <h2 class="gloss-title">오늘의 <span class="gradient-text">용어 사전</span></h2>
    <p class="gloss-desc">오늘 카드에 나온 어려운 말을 한곳에 모았어요.</p>
    <dl class="gloss-list">${rows.join("")}</dl>`;
}

// 카드 하나의 HTML을 만들어요
function cardHTML(item, rank, delay) {
  const summary = item.summary.map((line) => `<li>${line}</li>`).join("");

  const metrics = Object.keys(METRIC_NAMES).map((key) => `
    <div class="metric">
      <span class="metric-name">${METRIC_NAMES[key]}</span>
      <div class="bar"><span data-width="${item[key]}"></span></div>
      <span class="metric-value">${item[key]}</span>
    </div>`).join("");

  return `
    <article class="card ${item.category}" style="animation-delay:${delay}ms">
      <div class="card-top">
        <span class="badge">${CATEGORY_NAMES[item.category]}</span>
        <span class="rank ${rank <= 3 ? "top" : ""}">#${rank} · ${totalScore(item)}점</span>
      </div>
      <h2>${item.title}</h2>
      <ul class="summary">${summary}</ul>
      ${termsHTML(item)}
      <div class="metrics">${metrics}</div>
      <a class="source" href="${item.url}" target="_blank" rel="noopener">
        <span>${item.source}</span><span>원문 보기 →</span>
      </a>
    </article>`;
}

// 9개 기사를 종합 점수 높은 순으로 그려요
function render() {
  const list = [...NEWS].sort((a, b) => totalScore(b) - totalScore(a));

  const box = document.getElementById("cards");
  box.innerHTML = list.map((item, i) => cardHTML(item, i + 1, i * 60)).join("");
  renderGlossary(list);

  // 막대가 0에서 차오르는 애니메이션
  requestAnimationFrame(() => {
    box.querySelectorAll(".bar span").forEach((bar) => {
      bar.style.width = bar.dataset.width + "%";
    });
  });
}

document.getElementById("date").textContent = formatDate(NEWS_DATE);
render();
