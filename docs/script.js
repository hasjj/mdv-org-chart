// Google Apps Script 웹 앱 URL (doGet이 연결된 URL로 교체)
const SCRIPT_BASE_URL =
  'https://script.google.com/macros/s/AKfycbxm9uGPc4oxk8_9tkChDlpNM_QmhrX0jp3zq5q5d4ZtYxAwz-fxYF8-_hf1GoYB2wgu/exec';

document.addEventListener('DOMContentLoaded', () => {
  const rootEl = document.getElementById('org-root');
  loadOrgData(rootEl);
});

async function loadOrgData(rootEl) {
  try {
    rootEl.innerHTML = '<div class="loading">조직도 데이터를 불러오는 중...</div>';

    // 1) 현재 시트에 있는 데이터로 빠르게 로딩
    const dataRes = await fetch(SCRIPT_BASE_URL);
    const dataJson = await dataRes.json();
    const users = dataJson.users || [];

    const tree = buildOrgTree(users);
    rootEl.innerHTML = '';
    const treeDom = renderOrgTree(tree);
    rootEl.appendChild(treeDom);

    // 2) 백그라운드에서 최신 Directory → Sheet 동기화 트리거
    fetch(SCRIPT_BASE_URL + '?action=refresh')
      .then(() => {
        console.log('Background sync triggered');
      })
      .catch(err => {
        console.warn('Background sync error', err);
      });
  } catch (err) {
    console.error(err);
    rootEl.innerHTML =
      '<div class="loading">데이터를 불러오는 중 오류가 발생했습니다. 콘솔을 확인해 주세요.</div>';
  }
}

/**
 * OrgUnitPath 기반으로 트리 구조 만들기
 * - /CEO
 * - /CEO/R&D
 * - /CEO/Administration
 * - /CEO/Strategic Planning
 * 등 → ROOT > CEO > 각 부서 노드
 */
function buildOrgTree(users) {
  const root = {
    name: 'ROOT',
    children: {},
    members: []
  };

  users.forEach(function(user) {
    const path = (user.orgUnitPath || '').trim();
    if (!path) {
      root.members.push(user);
      return;
    }

    const segments = path.split('/').filter(function(s) { return s; });

    let current = root;
    segments.forEach(function(seg) {
      if (!current.children[seg]) {
        current.children[seg] = {
          name: seg,
          children: {},
          members: []
        };
      }
      current = current.children[seg];
    });

    current.members.push(user);
  });

  return root;
}

/**
 * 트리 구조를 DOM으로 렌더링
 * - CEO를 맨 위에 한 번 렌더링
 * - CEO의 children(부서들)을 그 아래에 좌우로 배치
 */
function renderOrgTree(tree) {
  const container = document.createElement('div');
  container.className = 'org-layout';

  const ceoNode =
    tree.children['CEO'] ||
    tree.children['Ceo'] ||
    tree.children['ceo'] ||
    null;

  if (ceoNode) {
    // 1) CEO 박스 (맨 위, 가운데 정렬 느낌)
    if (ceoNode.members && ceoNode.members.length > 0) {
      const ceoGroup = document.createElement('div');
      ceoGroup.className = 'org-group org-group-ceo';

      const headerEl = document.createElement('div');
      headerEl.className = 'org-group-header';
      const titleSpan = document.createElement('span');
      titleSpan.textContent = 'CEO';
      headerEl.appendChild(titleSpan);
      ceoGroup.appendChild(headerEl);

      const membersEl = document.createElement('div');
      membersEl.className = 'org-members org-members-ceo';

      ceoNode.members.forEach(function(user) {
        const card = createMemberCard(user);
        membersEl.appendChild(card);
      });

      ceoGroup.appendChild(membersEl);
      container.appendChild(ceoGroup);
    }

    // 2) 부서 박스들 (CEO 하위 children들을 좌우 배치)
    const deptWrapper = document.createElement('div');
    deptWrapper.className = 'org-children org-children-dept';

    const order = ['Administration', 'R&D', 'Strategic Planning'];
    const deptKeys = Object.keys(ceoNode.children || {});
    deptKeys.sort(function(a, b) {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      if (ia === -1 && ib === -1) {
        return a.localeCompare(b);
      }
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

    deptKeys.forEach(function(key) {
      const childNode = ceoNode.children[key];
      const childDom = renderOrgNode(childNode, 1);
      deptWrapper.appendChild(childDom);
    });

    container.appendChild(deptWrapper);
  } else {
    // CEO 노드를 못 찾으면 기존 방식으로 전체 children 렌더링
    const childrenKeys = Object.keys(tree.children);
    if (childrenKeys.length === 0 && tree.members.length === 0) {
      container.textContent = '조직도 데이터가 없습니다.';
      return container;
    }

    const childrenWrapper = document.createElement('div');
    childrenWrapper.className = 'org-children';

    childrenKeys.forEach(function(key) {
      const childNode = tree.children[key];
      const childDom = renderOrgNode(childNode, 0);
      childrenWrapper.appendChild(childDom);
    });

    container.appendChild(childrenWrapper);
  }

  return container;
}

/**
 * 개별 그룹 노드를 재귀적으로 렌더링
 * (부서 / 하위 팀 공용)
 */
function renderOrgNode(node, depth) {
  const groupEl = document.createElement('div');
  groupEl.className = 'org-group depth-' + (depth + 1);

  // 그룹 헤더 (그룹 이름만)
  const headerEl = document.createElement('div');
  headerEl.className = 'org-group-header';
  const titleSpan = document.createElement('span');
  titleSpan.textContent = node.name;
  headerEl.appendChild(titleSpan);
  groupEl.appendChild(headerEl);

  // 멤버 카드 영역
  if (node.members && node.members.length > 0) {
    const membersEl = document.createElement('div');
    membersEl.className = 'org-members';

    node.members.forEach(function(user) {
      const card = createMemberCard(user);
      membersEl.appendChild(card);
    });

    groupEl.appendChild(membersEl);
  }

  // 하위 그룹
  const childKeys = Object.keys(node.children || {});
  if (childKeys.length > 0) {
    const childrenEl = document.createElement('div');
    childrenEl.className = 'org-children';

    childKeys.forEach(function(key) {
      const childNode = node.children[key];
      const childDom = renderOrgNode(childNode, depth + 1);
      childrenEl.appendChild(childDom);
    });

    groupEl.appendChild(childrenEl);
  }

  return groupEl;
}

/**
 * 구성원 카드 생성
 * - 일반: name, title, email, cellphone
 * - Hiring: 이름 "채용 예정", title은 표시, email/phone은 공란
 */
function createMemberCard(user) {
  const isHiring = user.isHiring === true || user.isHiring === 'true';

  const card = document.createElement('div');
  card.className = 'member-card';
  if (isHiring) {
    card.classList.add('hiring');
  }

  const avatarWrap = document.createElement('div');
  avatarWrap.className = 'member-avatar';

  // photoUrl이 있으면 이미지를 추가, 없으면 CSS 기본 실루엣만 사용
  if (user.photoUrl) {
    const img = document.createElement('img');
    img.src = user.photoUrl;
    img.alt = user.name || 'profile';
    avatarWrap.appendChild(img);
  }

  const info = document.createElement('div');
  info.className = 'member-info';

  const nameEl = document.createElement('div');
  nameEl.className = 'member-name';
  const titleEl = document.createElement('div');
  titleEl.className = 'member-title';
  const meta = document.createElement('div');
  meta.className = 'member-meta';
  const emailEl = document.createElement('div');
  const phoneEl = document.createElement('div');

  if (isHiring) {
    nameEl.textContent = '채용 예정';
    titleEl.textContent = user.title || '';
    emailEl.textContent = '';
    phoneEl.textContent = '';
  } else {
    nameEl.textContent = user.name || '';
    titleEl.textContent = user.title || '';
    emailEl.textContent = user.email || '';
    phoneEl.textContent = user.cellphone || '';
  }

  meta.appendChild(emailEl);
  meta.appendChild(phoneEl);

  info.appendChild(nameEl);
  info.appendChild(titleEl);
  info.appendChild(meta);

  card.appendChild(avatarWrap);
  card.appendChild(info);

  return card;
}