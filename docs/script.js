// Google Apps Script 웹 앱 URL
const SCRIPT_BASE_URL =
  'https://script.google.com/macros/s/AKfycbxahRL-rkoLdTcfig8HCrJIm8mOZ2SinG6D8Iqi9gQgzITWvUuLo88lpkcOvtWY0ryU/exec';

document.addEventListener('DOMContentLoaded', () => {
  const rootEl = document.getElementById('org-root');
  const syncBtn = document.getElementById('sync-btn');

  // 초기 데이터 로드
  loadOrgData(rootEl);

  // 동기화 버튼 이벤트
  if (syncBtn) {
    syncBtn.addEventListener('click', () => {
      handleSync(rootEl);
    });
  }
});

async function loadOrgData(rootEl) {
  try {
    // 1) 현재 시트에 있는 데이터로 빠르게 로딩 (캐시 방지)
    const dataRes = await fetch(SCRIPT_BASE_URL + '?t=' + Date.now());
    const dataJson = await dataRes.json();
    const users = dataJson.users || [];

    renderData(rootEl, users);

  } catch (err) {
    console.error(err);
    rootEl.innerHTML =
      '<div class="error-message">데이터를 불러오는 중 오류가 발생했습니다.<br>잠시 후 다시 시도해 주세요.</div>';
  }
}

async function handleSync(rootEl) {
  const loadingOverlay = document.getElementById('loading-overlay');

  try {
    // 로딩 표시
    if (loadingOverlay) loadingOverlay.classList.remove('hidden');

    // 1. 동기화 요청 (action=refresh) - 캐시 방지
    // GAS가 처리를 시작하도록 요청
    await fetch(SCRIPT_BASE_URL + '?action=refresh&t=' + Date.now());

    // 2. 서버가 작업을 완료할 시간을 줌 (2초 대기)
    // GAS 스크립트가 실행되고 시트가 업데이트 되는 물리적 시간 고려
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 3. 데이터 재요청 (동기화된 최신 데이터) - 캐시 방지
    const dataRes = await fetch(SCRIPT_BASE_URL + '?t=' + Date.now());
    const dataJson = await dataRes.json();
    const users = dataJson.users || [];

    renderData(rootEl, users);
    showToast('조직도가 최신화되었습니다.');

  } catch (err) {
    console.error('Sync error', err);
    showToast('동기화 중 오류가 발생했습니다.');
  } finally {
    if (loadingOverlay) loadingOverlay.classList.add('hidden');
  }
}

function renderData(rootEl, users) {
  // 활성 사용자만 필터링 (suspended != true)
  // 단, 채용 예정(isHiring)은 표시
  const activeUsers = users.filter(user => {
    const isSuspended = user.suspended === true || user.suspended === 'TRUE' || user.suspended === 'true';
    const isHiring = user.isHiring === true || user.isHiring === 'TRUE' || user.isHiring === 'true';
    // 채용 예정자는 suspended 상태여도 보여줌 (로직상 그럴리 없지만 안전하게)
    if (isHiring) return true;

    return !isSuspended;
  });

  // 트리 구조 빌드
  const tree = buildOrgTree(activeUsers);

  // 기존 내용 비우기
  rootEl.innerHTML = '';

  // 1. 모바일용 뷰 (기존 iOS 스타일)
  const mobileContainer = document.createElement('div');
  mobileContainer.className = 'mobile-view-container';
  mobileContainer.appendChild(renderMobileTree(tree)); // 기존 renderOrgTree -> renderMobileTree
  rootEl.appendChild(mobileContainer);

  // 2. 데스크톱용 뷰 (전통적 Tree 스타일)
  const desktopContainer = document.createElement('div');
  desktopContainer.className = 'desktop-view-container hidden-on-mobile';
  desktopContainer.appendChild(renderDesktopTree(tree));
  rootEl.appendChild(desktopContainer);
}

/**
 * OrgUnitPath 기반으로 트리 구조 만들기
 */
function buildOrgTree(users) {
  const root = {
    name: 'ROOT',
    children: {},
    members: []
  };

  users.forEach(function (user) {
    const path = (user.orgUnitPath || '').trim();
    if (!path) {
      root.members.push(user);
      return;
    }

    const segments = path.split('/').filter(function (s) { return s; });

    let current = root;
    segments.forEach(function (seg) {
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
 * 트리 구조를 DOM으로 렌더링 (iOS Grouped List Style for Mobile)
 * Renamed from renderOrgTree to renderMobileTree
 */
function renderMobileTree(tree) {
  const container = document.createElement('div');
  container.className = 'org-container';

  // CEO 노드 찾기
  const ceoNode =
    tree.children['CEO'] ||
    tree.children['Ceo'] ||
    tree.children['ceo'] ||
    null;

  if (ceoNode) {
    // 1. CEO 섹션
    const ceoSection = createListGroup('CEO');
    if (ceoNode.members) {
      // 정렬 적용
      const sortedMembers = sortMembersByTitle(ceoNode.members);
      sortedMembers.forEach(user => {
        ceoSection.list.appendChild(createMemberRow(user));
      });
    }
    container.appendChild(ceoSection.wrapper);

    // 2. 하위 부서
    const deptKeys = Object.keys(ceoNode.children || {});
    // 정렬
    const order = ['Administration', 'R&D', 'Strategic Planning'];
    deptKeys.sort((a, b) => {
      const ia = order.indexOf(a);
      const ib = order.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

    deptKeys.forEach(key => {
      const childNode = ceoNode.children[key];
      const deptSection = createListGroup(childNode.name);

      // 부서원
      if (childNode.members) {
        // 정렬 적용
        const sortedMembers = sortMembersByTitle(childNode.members);
        sortedMembers.forEach(user => {
          deptSection.list.appendChild(createMemberRow(user));
        });
      }

      // 하위 팀 (recursive 로직 대신 1-depth 하위까지만 평탄화해서 보여줌)
      const subKeys = Object.keys(childNode.children || {});
      if (subKeys.length > 0) {
        subKeys.forEach(sk => {
          const subNode = childNode.children[sk];

          // 구분선이나 소제목 같은 row 추가
          const subHeaderRow = document.createElement('div');
          subHeaderRow.className = 'ios-list-row sub-header-row';
          subHeaderRow.textContent = subNode.name; // "Backend Team" 등
          deptSection.list.appendChild(subHeaderRow);

          if (subNode.members) {
            // 정렬 적용
            const sortedSubMembers = sortMembersByTitle(subNode.members);
            sortedSubMembers.forEach(user => {
              deptSection.list.appendChild(createMemberRow(user));
            });
          }
        });
      }

      container.appendChild(deptSection.wrapper);
    });

  } else {
    // Fallback
    const keys = Object.keys(tree.children);
    if (keys.length === 0 && tree.members.length > 0) {
      const sec = createListGroup('Members');
      // 정렬 적용
      const sortedMembers = sortMembersByTitle(tree.members);
      sortedMembers.forEach(u => sec.list.appendChild(createMemberRow(u)));
      container.appendChild(sec.wrapper);
    } else {
      keys.forEach(k => {
        const n = tree.children[k];
        const sec = createListGroup(n.name);
        if (n.members) {
          // 정렬 적용
          const sortedMembers = sortMembersByTitle(n.members);
          sortedMembers.forEach(u => sec.list.appendChild(createMemberRow(u)));
        }
        container.appendChild(sec.wrapper);
      });
    }
  }

  return container;
}


/**
 * 직책 기반 정렬 함수
 * 1. CEO
 * 2. CSO, CMO, CFO, PM (각 부서 최상단)
 * 3. PRO, 프로
 * 4. 인턴
 * 5. 채용 예정 (isHiring)
 */
function sortMembersByTitle(members) {
  // 우선순위 정의 (낮을수록 높음)
  const rankMap = {
    'CEO': 0,
    'CSO': 1, 'CMO': 1, 'CFO': 1, 'PM': 1,
    'PRO': 2, '프로': 2,
    '인턴': 3, 'Intern': 3
  };

  return [...members].sort((a, b) => {
    // 1. "채용 예정" (isHiring) 체크 -> 5순위 (가장 뒤)
    const aHiring = a.isHiring === true || a.isHiring === 'true';
    const bHiring = b.isHiring === true || b.isHiring === 'true';

    if (aHiring && !bHiring) return 1;
    if (!aHiring && bHiring) return -1;
    if (aHiring && bHiring) return 0; // 둘 다 채용예정이면 순서 유지(또는 이름순)

    // 2. 직책 기반 랭킹
    const titleA = (a.title || '').trim();
    const titleB = (b.title || '').trim();

    const getRank = (t) => {
      // 정확히 일치하거나, 포함되는지 확인
      // (예: "Senior PM" -> PM으로 칠 것인가? 요구사항: "CSO, CMO..." 명시됨.
      // "PRO"가 포함되면 2순위 등 유연하게 처리)
      const tUpper = t.toUpperCase();

      if (tUpper.includes('CEO')) return 0;
      if (tUpper.includes('CSO') || tUpper.includes('CMO') || tUpper.includes('CFO') || tUpper.includes('PM')) return 1;
      if (tUpper.includes('PRO') || tUpper.includes('프로')) return 2;
      if (tUpper.includes('인턴') || tUpper.includes('INTERN')) return 3;

      return 99; // 그 외
    };

    const rankA = getRank(titleA);
    const rankB = getRank(titleB);

    if (rankA !== rankB) {
      return rankA - rankB;
    }

    // 3. 같은 레벨에서는 가나다순
    return (a.name || '').localeCompare(b.name || '');
  });
}



// createSection 수정: 사용하기 편하게
function createSection(title) {
  const wrapper = document.createElement('div');
  wrapper.className = 'ios-section-wrapper';

  if (title) {
    const header = document.createElement('div');
    header.className = 'ios-section-header';
    header.textContent = title;
    wrapper.appendChild(header);
  }

  const listGroup = document.createElement('div');
  listGroup.className = 'ios-list-group';
  wrapper.appendChild(listGroup);

  return wrapper;
  // 호출자는 wrapper.querySelector('.ios-list-group').appendChild(...) 사용
  // 또는 반환된 wrapper 자체에 appendChild를 오버라이드? -> 복잡함.
  // 호출 코드를 수정하자.
}



/**
 * 데스크톱용 전통적 트리 렌더링
 * <ul><li> 구조를 사용하여 CSS Tree Diagram 표현
 */
function renderDesktopTree(tree) {
  const container = document.createElement('div');
  container.className = 'tf-tree tf-gap-sm';

  const ul = document.createElement('ul');
  const li = document.createElement('li');

  // 1. Identify the Visual Root (Targeting "CEO")
  // We prefer the 'CEO' folder.
  let ceoNode = tree.children['CEO'] || tree.children['Ceo'] || tree.children['ceo'];
  let rootTitle = 'CEO';
  let rootMembers = [];

  // If CEO folder exists, use its members on the top card
  if (ceoNode) {
    rootTitle = ceoNode.name || 'CEO';
    rootMembers = ceoNode.members || [];
  } else {
    // If no CEO folder, maybe the CEO is in the root members?
    // Let's filter tree.members for anyone with title "CEO" or "Representative"
    const realCeo = tree.members.find(m => (m.title || '').toUpperCase().includes('CEO'));
    if (realCeo) {
      rootTitle = 'CEO';
      rootMembers = [realCeo];
      // Remove from tree.members so we don't duplicate
      tree.members = tree.members.filter(m => m !== realCeo);
    } else {
      rootTitle = 'Management';
      // In worst case, show non-system root members
    }
  }

  // Filter out system accounts and merge valid root members into CEO card
  const validRootMembers = tree.members.filter(m => {
    const name = (m.name || '').toLowerCase();
    const title = (m.title || '').toUpperCase();
    if (title.includes('CEO')) return false;
    if (name.includes('admin') || name.includes('modigence') || name.includes('vision')) return false;
    return true;
  });
  rootMembers.push(...validRootMembers);

  // Create Root Card (now includes merged root members)
  const rootCard = createDesktopCard(rootTitle, rootMembers);
  li.appendChild(rootCard);

  // 2. Prepare Children (Departments)
  const childrenUl = document.createElement('ul');
  let hasChildren = false;

  // Departments are children of the CEO node (or root children if no CEO node)
  let childKeys = [];
  if (ceoNode) {
    childKeys = Object.keys(ceoNode.children || {});
  } else {
    childKeys = Object.keys(tree.children);
  }

  // Sort Departments
  const order = ['Administration', 'R&D', 'Strategic Planning'];
  childKeys.sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });

  childKeys.forEach(key => {
    const parentSource = ceoNode ? ceoNode.children : tree.children;
    const childNode = parentSource[key];
    childrenUl.appendChild(createDesktopNode(childNode));
    hasChildren = true;
  });

  if (hasChildren) {
    li.appendChild(childrenUl);
  }

  ul.appendChild(li);
  container.appendChild(ul);

  // Clone the HTML header so text is managed in index.html, not JS
  const originalHeader = document.querySelector('.app-header');
  const desktopHeader = originalHeader.cloneNode(true);
  desktopHeader.className = 'desktop-header';
  // Wire cloned sync button to trigger the original
  const clonedBtn = desktopHeader.querySelector('.sync-btn');
  if (clonedBtn) {
    clonedBtn.removeAttribute('id');
    clonedBtn.addEventListener('click', function () {
      document.getElementById('sync-btn').click();
    });
  }

  // Wrap tree in a container for alignment
  const wrapper = document.createElement('div');
  wrapper.className = 'desktop-tree-wrapper';
  wrapper.appendChild(desktopHeader);
  wrapper.appendChild(container);
  return wrapper;
}

// 재귀적으로 노드 생성
function createDesktopNode(node) {
  const li = document.createElement('li');

  // 현재 노드의 카드
  const card = createDesktopCard(node.name, node.members);
  li.appendChild(card);

  // 자식 노드 확인
  const childKeys = Object.keys(node.children || {});
  if (childKeys.length > 0) {
    const ul = document.createElement('ul');

    // 필요하다면 여기서도 정렬 가능
    childKeys.sort();

    childKeys.forEach(key => {
      ul.appendChild(createDesktopNode(node.children[key]));
    });
    li.appendChild(ul);
  }

  return li;
}

function createDesktopCard(title, members) {
  const card = document.createElement('div');
  card.className = 'tf-nc'; // Node Content

  // 타이틀
  const titleEl = document.createElement('div');
  titleEl.className = 'desktop-node-title';
  titleEl.textContent = title; // 부서명
  card.appendChild(titleEl);

  // 멤버 리스트
  if (members && members.length > 0) {
    const memberList = document.createElement('div');
    memberList.className = 'desktop-member-list';

    const sorted = sortMembersByTitle(members);
    sorted.forEach(user => {
      const p = document.createElement('div');
      p.className = 'desktop-member-item';

      const isHiring = user.isHiring === true || user.isHiring === 'true';
      if (isHiring) p.classList.add('hiring');

      // Left: Avatar
      const avatarWrapper = document.createElement('div');
      avatarWrapper.className = 'd-avatar-wrapper';
      if (user.photoUrl && !isHiring) {
        const img = document.createElement('img');
        img.src = user.photoUrl;
        img.className = 'd-avatar-img';
        img.alt = user.name || '';
        img.onerror = () => {
          img.style.display = 'none';
          avatarWrapper.classList.add('default');
          avatarWrapper.textContent = (user.name || '?')[0];
        };
        avatarWrapper.appendChild(img);
      } else {
        avatarWrapper.classList.add('default');
        avatarWrapper.textContent = isHiring ? '+' : (user.name || '?')[0];
      }
      p.appendChild(avatarWrapper);

      // Right: Info
      const infoDiv = document.createElement('div');
      infoDiv.className = 'd-info';

      // Row 1: Name | Title | Dept
      const line1 = document.createElement('div');
      line1.className = 'd-line-primary';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'd-name';
      nameSpan.textContent = isHiring ? '채용 예정' : user.name;
      line1.appendChild(nameSpan);

      if (!isHiring && user.title) {
        const titleSpan = document.createElement('span');
        titleSpan.className = 'd-title';
        titleSpan.textContent = user.title;
        line1.appendChild(titleSpan);
      }

      if (!isHiring) {
        let deptName = '';
        if (user.orgUnitPath) {
          const parts = user.orgUnitPath.split('/');
          deptName = parts[parts.length - 1];
        }
        if (deptName) {
          const sep = document.createElement('span');
          sep.className = 'd-sep';
          sep.textContent = '|';
          line1.appendChild(sep);

          const deptSpan = document.createElement('span');
          deptSpan.className = 'd-dept';
          deptSpan.textContent = deptName;
          line1.appendChild(deptSpan);
        }
      }
      infoDiv.appendChild(line1);

      // Row 2: Email
      if (!isHiring && user.email) {
        const lineEmail = document.createElement('div');
        lineEmail.className = 'd-line-sub';
        const mailLink = document.createElement('a');
        mailLink.href = `mailto:${user.email}`;
        mailLink.textContent = user.email;
        mailLink.className = 'd-link';
        mailLink.addEventListener('click', (e) => {
          e.stopPropagation();
          if (window.innerWidth >= 1200) {
            e.preventDefault();
            navigator.clipboard.writeText(user.email).then(() => showToast(`이메일 복사됨`));
          }
        });
        lineEmail.appendChild(mailLink);
        infoDiv.appendChild(lineEmail);
      }

      // Row 3: Phone
      if (!isHiring && user.cellphone) {
        const linePhone = document.createElement('div');
        linePhone.className = 'd-line-sub';
        const telLink = document.createElement('a');
        telLink.href = `tel:${user.cellphone}`;
        telLink.textContent = user.cellphone;
        telLink.className = 'd-link';
        telLink.addEventListener('click', (e) => {
          e.stopPropagation();
          if (window.innerWidth >= 1200) {
            e.preventDefault();
            navigator.clipboard.writeText(user.cellphone).then(() => showToast(`전화번호 복사됨`));
          }
        });
        linePhone.appendChild(telLink);
        infoDiv.appendChild(linePhone);
      }

      p.appendChild(infoDiv);

      // Click handler for the whole card
      if (!isHiring) {
        p.addEventListener('click', (e) => {
          e.stopPropagation();
          handleMemberClick(user);
        });
        p.style.cursor = 'pointer';
      }

      memberList.appendChild(p);
    });
    card.appendChild(memberList);
  }

  return card;
}


function createListGroup(title) {
  const wrapper = document.createElement('div');
  wrapper.className = 'ios-section';

  if (title) {
    const header = document.createElement('div');
    header.className = 'ios-section-header';
    header.textContent = title;
    wrapper.appendChild(header);
  }

  const list = document.createElement('div');
  list.className = 'ios-list';
  wrapper.appendChild(list);

  return { wrapper, list };
}

function createMemberRow(user) {
  const isHiring = user.isHiring === true || user.isHiring === 'true';

  const row = document.createElement('div');
  row.className = 'ios-list-row member-row';
  if (isHiring) row.classList.add('hiring');

  // 아바타
  const avatar = document.createElement('div');
  avatar.className = 'member-avatar';
  if (user.photoUrl && !isHiring) {
    avatar.style.backgroundImage = `url('${user.photoUrl}')`;
  } else {
    avatar.classList.add('default');
    avatar.innerText = (user.name || '?')[0];
  }

  // 정보 영역
  const info = document.createElement('div');
  info.className = 'member-info';

  // 1. 이름 & 직책
  const nameRow = document.createElement('div');
  nameRow.className = 'info-row name-row';

  const nameEl = document.createElement('span');
  nameEl.className = 'row-name';
  nameEl.textContent = isHiring ? '채용 예정' : (user.name || '이름 없음');

  const titleEl = document.createElement('span');
  titleEl.className = 'row-title';
  titleEl.textContent = user.title ? ` ${user.title}` : '';

  nameRow.appendChild(nameEl);
  nameRow.appendChild(titleEl);

  // 2. 부서/팀 (데이터가 있으면 표시)
  // orgUnitPath에서 마지막 부분만 추출해서 팀명으로 표시
  let teamName = '';
  if (user.orgUnitPath && user.orgUnitPath !== '/') {
    const parts = user.orgUnitPath.split('/');
    teamName = parts[parts.length - 1];
  }

  // 3. 연락처 (전화, 이메일)
  const contactRow = document.createElement('div');
  contactRow.className = 'info-row contact-row';

  // 팀명
  if (teamName) {
    const teamSpan = document.createElement('span');
    teamSpan.textContent = teamName;
    contactRow.appendChild(teamSpan);
  }

  // 구분자 및 링크 추가 헬퍼
  const addSeparator = () => {
    const sep = document.createElement('span');
    sep.textContent = ' | ';
    sep.style.opacity = '0.5';
    contactRow.appendChild(sep);
  };

  const createMobileContactLink = (type, value) => {
    const link = document.createElement('a');
    link.href = type === 'tel' ? `tel:${value}` : `mailto:${value}`;
    link.textContent = value;
    link.className = 'contact-link';
    link.addEventListener('click', (e) => {
      e.stopPropagation();
      // 모바일 뷰에서도 1200px 이상이면 복사? -> 모바일 뷰는 hidden-on-desktop 이므로 
      // 사실상 모바일 기기이거나 작은 창임. 따라서 항상 링크 동작.
      // 다만 "데스크탑 모드"로 볼 수도 있으니 안전장치
      if (!(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) && window.innerWidth >= 1200) {
        e.preventDefault();
        navigator.clipboard.writeText(value).then(() => {
          showToast(`${type === 'tel' ? '전화번호' : '이메일'}가 복사되었습니다.`);
        });
      }
    });
    return link;
  };

  if (user.cellphone) {
    if (contactRow.hasChildNodes()) addSeparator();
    contactRow.appendChild(createMobileContactLink('tel', user.cellphone));
  }

  if (user.email) {
    if (contactRow.hasChildNodes()) addSeparator();
    contactRow.appendChild(createMobileContactLink('email', user.email));
  }

  // contactRow.textContent = details.join(' | '); // 기존 코드 제거

  info.appendChild(nameRow);
  info.appendChild(contactRow);

  row.appendChild(avatar);
  row.appendChild(info);

  // 클릭 이벤트
  if (!isHiring) {
    row.addEventListener('click', () => handleMemberClick(user));
    row.style.cursor = 'pointer';

    const arrow = document.createElement('div');
    arrow.className = 'row-arrow';
    arrow.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C7C7CC" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';
    row.appendChild(arrow);
  }

  return row;
}

function handleMemberClick(user) {
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth <= 768;

  if (isMobile) {
    // 모바일: 액션 시트나 바로 전화/메일 선택? 
    // 요구사항: "자동 전화 혹은 메일 보내기" -> 하나만 선택하기 어려우므로 선택지(Action Sheet)를 주거나,
    // 전화번호가 있으면 전화, 없으면 메일?
    // iOS 스타일 -> Action Sheet가 적절.
    // 여기서는 브라우저 confirm 대신 커스텀 UI가 좋지만, 
    // 간단하게 href tel/mailto를 사용하는 방식

    const hasPhone = !!user.cellphone;
    const hasEmail = !!user.email;

    if (hasPhone && hasEmail) {
      // 둘 다 있으면 묻기 (간단히 prompt나 confirm 사용 하거나, OS 네이티브 동작 유도)
      // 가장 좋은 UX: 전화번호가 메인, 이메일은 서브? 
      // 여기서는 `tel:`로 바로 연결 시도하되, 사용자가 취소하면 아무일 없음.
      // 하지만 "클릭하면 자동 전화 혹은 메일"
      window.location.href = `tel:${user.cellphone}`;
    } else if (hasPhone) {
      window.location.href = `tel:${user.cellphone}`;
    } else if (hasEmail) {
      window.location.href = `mailto:${user.email}`;
    }
  } else {
    // 데스크톱: 클립보드 복사
    const textToCopy = `${user.name} (${user.email || user.cellphone})`;
    const val = user.email || user.cellphone || '';
    if (val) {
      navigator.clipboard.writeText(val).then(() => {
        showToast(`클립보드에 복사되었습니다: ${val}`);
      });
    }
  }
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;

  toast.textContent = msg;
  toast.classList.remove('hidden');
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.classList.add('hidden'), 300);
  }, 2000);
}