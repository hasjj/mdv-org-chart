const API_BASE =
  "https://script.google.com/macros/s/AKfycbxm9uGPc4oxk8_9tkChDlpNM_QmhrX0jp3zq5q5d4ZtYxAwz-fxYF8-_hf1GoYB2wgu/exec";

const EMP_API = `${API_BASE}?tab=employees`;
const HIRING_API = `${API_BASE}?tab=hiring`;

async function loadData() {
  try {
    const [empRes, hirRes] = await Promise.all([
      fetch(EMP_API),
      fetch(HIRING_API),
    ]);

    const employees = await empRes.json();
    const hiring = await hirRes.json();

    renderOrgChart(employees, hiring);
  } catch (err) {
    console.error("Error loading data:", err);
    const container = document.getElementById("org-chart");
    if (container) {
      container.innerHTML =
        "<div>데이터를 불러오는 중 오류가 발생했습니다. 콘솔을 확인해 주세요.</div>";
    }
  }
}

// orgUnitPath를 레벨별로 분해해서 상위/하위 그룹 이름을 뽑는 헬퍼
// 예: "/CEO/Strategic Planning" -> { level1: "CEO", level2: "Strategic Planning" }
//     "/CEO" -> { level1: "CEO", level2: "" }
//     "/" 또는 빈 값 -> { level1: "기타", level2: "" }
function parseOrgPath(orgUnitPath) {
  if (!orgUnitPath || orgUnitPath === "/") {
    return { level1: "기타", level2: "" };
  }
  const segments = orgUnitPath.split("/").filter(Boolean);
  if (!segments.length) {
    return { level1: "기타", level2: "" };
  }
  const level1 = segments[0] || "기타";
  const level2 = segments[1] || "";
  return { level1, level2 };
}

// orgUnitPath 기준 계층 + 그룹만 사용해서 렌더링
// - level1: 예) CEO, HQ ... → 최상위 섹션 라벨
// - level2: 예) Strategic Planning, R&D ... → 섹션 안의 그룹 라벨
// managerEmail은 아직 계층 종속에 사용하지 않음
function renderOrgChart(employees, hiring) {
  const container = document.getElementById("org-chart");
  if (!container) return;

  // employees + hiring 을 하나의 리스트로 묶고 org 정보 주입
  const items = [
    ...employees.map((e) => ({
      ...e,
      isHiring: false,
      ...parseOrgPath(e.orgUnitPath),
    })),
    ...hiring.map((h) => ({
      ...h,
      isHiring: true,
      ...parseOrgPath(h.orgUnitPath),
    })),
  ];

  // 1단계: level1(예: CEO) 기준으로 그룹핑
  const level1Map = new Map();
  items.forEach((item) => {
    const key = item.level1;
    if (!level1Map.has(key)) level1Map.set(key, []);
    level1Map.get(key).push(item);
  });

  const level1Keys = Array.from(level1Map.keys()).sort();

  const html = level1Keys
    .map((level1) => {
      const itemsAtL1 = level1Map.get(level1) || [];

      // level2가 없는 사람들(/CEO만 가진 사람들)은 섹션 상단에 배치
      const topLevel = [];
      const level2Map = new Map();

      itemsAtL1.forEach((item) => {
        if (!item.level2) {
          topLevel.push(item);
        } else {
          const key2 = item.level2;
          if (!level2Map.has(key2)) level2Map.set(key2, []);
          level2Map.get(key2).push(item);
        }
      });

      // 이름 기준 정렬 (optional)
      const sortByName = (a, b) => (a.name || "").localeCompare(b.name || "");
      topLevel.sort(sortByName);

      const topRowHtml = topLevel.length
        ? `<div class="tree root-row">${topLevel
            .map((it) => cardHTML(it, it.isHiring))
            .join("")}</div>`
        : "";

      const level2Keys = Array.from(level2Map.keys()).sort();
      const groupsHtml = level2Keys
        .map((level2) => {
          const groupItems = level2Map.get(level2) || [];
          groupItems.sort(sortByName);
          const cards = groupItems
            .map((it) => cardHTML(it, it.isHiring))
            .join("");
          return `
            <div class="subgroup">
              <h3 class="subgroup-title">${level2}</h3>
              <div class="tree">${cards}</div>
            </div>
          `;
        })
        .join("");

      return `
        <section class="dept">
          <h2 class="dept-title">${level1}</h2>
          ${topRowHtml}
          ${groupsHtml}
        </section>
      `;
    })
    .join("");

  container.innerHTML = html;
}

// 카드 UI (표시 정보)
// 요구사항: Manager 는 표시하지 않고, Title + Email 위주
function cardHTML(row, isHiring) {
  const klass = isHiring ? "card hiring" : "card";

  const displayName = isHiring
    ? `🔍 Hiring: ${row.title}`
    : row.name || "(이름 없음)";

  const titleLine = row.title
    ? `<div class="card-line">${row.title}</div>`
    : "";
  const emailLine = row.email
    ? `<div class="card-line">${row.email}</div>`
    : "";

  return `
    <div class="${klass}">
      <div class="card-title">${displayName}</div>
      <div class="card-body">
        ${titleLine}
        ${emailLine}
      </div>
    </div>
  `;
}

loadData();