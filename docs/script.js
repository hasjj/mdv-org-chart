const API_BASE = "https://script.google.com/macros/s/AKfycbxm9uGPc4oxk8_9tkChDlpNM_QmhrX0jp3zq5q5d4ZtYxAwz-fxYF8-_hf1GoYB2wgu/exec";

const EMP_API = `${API_BASE}?tab=employees`;
const HIRING_API = `${API_BASE}?tab=hiring`;

async function loadData() {
  try {
    const [empRes, hirRes] = await Promise.all([
      fetch(EMP_API),
      fetch(HIRING_API)
    ]);

    const employees = await empRes.json();
    const hiring = await hirRes.json();

    renderOrgChart(employees, hiring);

  } catch (err) {
    console.error("Error loading data:", err);
  }
}

function renderOrgChart(employees, hiring) {
  const container = document.getElementById("org-chart");

  const empCards = employees.map(e => cardHTML(e, false));
  const hireCards = hiring.map(h => cardHTML(h, true));

  container.innerHTML = [...empCards, ...hireCards].join("");
}

function cardHTML(row, isHiring) {
  const klass = isHiring ? "card hiring" : "card";

  const displayName =
    isHiring
      ? `🔍 Hiring: ${row.title}`
      : row.name;

  return `
    <div class="${klass}">
      <div class="card-title">${displayName}</div>
      <div class="card-body">
        <strong>${row.department || "-"}</strong><br/>
        ${row.title || ""}<br/>
        ${row.managerEmail ? "Manager: " + row.managerEmail : ""}
      </div>
    </div>
  `;
}

loadData();