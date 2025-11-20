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

  // CEO 레벨과 그 외 레벨 분리
  const ceoItems = items.filter(
    (it) => it.orgUnitPath === "/CEO" || it.level1 === "CEO"
  );
  const others = items.filter((it) => !ceoItems.includes(it));

  // 기타 그룹: CEO를 제외한 나머지 level1 값 기준
  const groupMap = new Map();
  others.forEach((item) => {
    const key = item.level1 || "기타";
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key).push(item);
  });

  const sortByName = (a, b) => (a.name || "").localeCompare(b.name || "");
  ceoItems.sort(sortByName);

  const groupNames = Array.from(groupMap.keys()).sort();

  const ceoRowHtml = ceoItems.length
    ? `<div class="tree root-row">${ceoItems
        .map((it) => cardHTML(it, it.isHiring))
        .join("")}</div>`
    : "";

  const groupsHtml = groupNames
    .map((groupName) => {
      const groupItems = groupMap.get(groupName) || [];
      groupItems.sort(sortByName);
      const cards = groupItems
        .map((it) => cardHTML(it, it.isHiring))
        .join("");
      return `
        <div class="subgroup">
          <h3 class="subgroup-title">${groupName}</h3>
          <div class="tree">${cards}</div>
        </div>
      `;
    })
    .join("");

  container.innerHTML = `
    <section class="dept dept-root">
      <h2 class="dept-title dept-title-root">CEO</h2>
      ${ceoRowHtml}
      ${ceoItems.length && groupNames.length ? '<div class="root-connector"></div>' : ""}
      <div class="child-groups">${groupsHtml}</div>
    </section>
  `;
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