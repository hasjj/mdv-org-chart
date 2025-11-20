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

/**
 * employees : 실제 구성원
 * hiring    : 채용 포지션
 *
 * 1) managerEmail 로 상하 관계를 구성
 * 2) employees 를 email 기준으로 트리로 만들고,
 * 3) hiring 은 해당 manager 의 children 아래에 붙임
 */
function buildHierarchy(employees, hiring) {
  const empByEmail = new Map();

  // 노드 초기화
  employees.forEach((e) => {
    empByEmail.set(e.email, {
      ...e,
      children: [],
      hiringChildren: [],
      _attached: false,
    });
  });

  // 직원들 사이 상하관계 연결
  empByEmail.forEach((node) => {
    const mgrEmail = node.managerEmail;
    if (mgrEmail && empByEmail.has(mgrEmail)) {
      const mgr = empByEmail.get(mgrEmail);
      mgr.children.push(node);
      node._attached = true;
    }
  });

  // Hiring 포지션을 매니저 밑에 붙이기
  hiring.forEach((h) => {
    const mgrEmail = h.managerEmail;
    const mgr = mgrEmail && empByEmail.get(mgrEmail);
    if (mgr) {
      mgr.hiringChildren.push(h);
    }
  });

  // 루트(상위 매니저가 없거나 도메인 밖인 사람들)
  const roots = [];
  empByEmail.forEach((node) => {
    if (!node._attached) {
      roots.push(node);
    }
  });

  return { roots, empByEmail };
}

function renderOrgChart(employees, hiring) {
  const container = document.getElementById("org-chart");
  if (!container) return;

  const { roots } = buildHierarchy(employees, hiring);

  // 부서(department)별로 루트 그룹핑
  const deptMap = new Map();
  roots.forEach((root) => {
    const dept = root.department || "기타";
    if (!deptMap.has(dept)) deptMap.set(dept, []);
    deptMap.get(dept).push(root);
  });

  const deptNames = Array.from(deptMap.keys()).sort();

  const html = deptNames
    .map((dept) => {
      const rootsInDept = deptMap.get(dept) || [];
      const treesHtml = rootsInDept.map((r) => renderNode(r));
      return `
        <section class="dept">
          <h2 class="dept-title">${dept}</h2>
          <div class="tree">
            ${treesHtml.join("")}
          </div>
        </section>
      `;
    })
    .join("");

  container.innerHTML = html;
}

// 개별 직원 노드 + 자식들 렌더링
function renderNode(node) {
  const children = node.children || [];
  const hiringChildren = node.hiringChildren || [];

  const childrenHtml = [
    ...children.map((c) => renderNode(c)),
    ...hiringChildren.map((h) => renderHiringNode(h)),
  ];

  return `
    <div class="node">
      ${cardHTML(node, false)}
      ${
        childrenHtml.length
          ? `<div class="children">${childrenHtml.join("")}</div>`
          : ""
      }
    </div>
  `;
}

// Hiring 노드는 한 단계짜리로만
function renderHiringNode(h) {
  return `
    <div class="node">
      ${cardHTML(h, true)}
    </div>
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