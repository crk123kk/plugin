let cachedQuestions = [];
let currentTabId = null;

document.addEventListener('DOMContentLoaded', () => {
  loadQuestions();

  document.getElementById('refreshBtn').addEventListener('click', () => {
    forceRescan();
  });

  document.getElementById('searchInput').addEventListener('input', (e) => {
    filterQuestions(e.target.value);
  });
});

// 获取当前活动标签页 ID
async function getCurrentTabId() {
  if (currentTabId) return currentTabId;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab.id;
  return tab.id;
}

// 强制重新扫描页面 - 直接执行脚本
async function forceRescan() {
  const questionListEl = document.getElementById('questionList');
  const emptyStateEl = document.getElementById('emptyState');
  const questionCountEl = document.getElementById('questionCount');

  // 按钮旋转动画
  const btn = document.getElementById('refreshBtn');
  btn.style.animation = 'spin 0.5s ease-in-out';
  setTimeout(() => {
    btn.style.animation = '';
  }, 500);

  questionListEl.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <p>正在重新扫描...</p>
    </div>
  `;
  emptyStateEl.style.display = 'none';

  try {
    const tabId = await getCurrentTabId();

    // 先执行脚本确保 content script 已注入
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js']
    });

    // 等待一小段时间让脚本执行
    await new Promise(resolve => setTimeout(resolve, 200));

    // 然后获取最新的问题列表
    loadQuestions();

  } catch (error) {
    console.error('重新扫描失败:', error);
    // 如果 scripting 失败，尝试直接发送消息
    loadQuestions();
  }
}

async function loadQuestions() {
  const questionListEl = document.getElementById('questionList');
  const emptyStateEl = document.getElementById('emptyState');
  const questionCountEl = document.getElementById('questionCount');

  if (!questionListEl.innerHTML.includes('spinner')) {
    questionListEl.innerHTML = `
      <div class="loading">
        <div class="spinner"></div>
        <p>正在扫描页面...</p>
      </div>
    `;
  }
  emptyStateEl.style.display = 'none';

  try {
    const tabId = await getCurrentTabId();

    chrome.tabs.sendMessage(tabId, { action: 'getQuestions' }, (response) => {
      if (chrome.runtime.lastError) {
        // 如果消息发送失败，尝试先注入脚本再重试
        console.log('消息发送失败，尝试注入脚本...');

        chrome.scripting.executeScript({
          target: { tabId },
          files: ['content.js']
        }, () => {
          setTimeout(() => {
            loadQuestions();
          }, 300);
        });
        return;
      }

      if (response && response.questions && response.questions.length > 0) {
        cachedQuestions = response.questions;
        questionCountEl.textContent = `共 ${response.questions.length} 条对话`;
        renderQuestions(response.questions);
        emptyStateEl.style.display = 'none';
      } else {
        cachedQuestions = [];
        questionCountEl.textContent = '共 0 条对话';
        questionListEl.innerHTML = '';
        emptyStateEl.style.display = 'flex';
      }
    });
  } catch (error) {
    console.error('加载对话失败:', error);
    questionListEl.innerHTML = `
      <div class="loading">
        <p>加载失败，请重试</p>
      </div>
    `;
  }
}

function renderQuestions(questions) {
  const questionListEl = document.getElementById('questionList');
  questionListEl.innerHTML = '';

  if (questions.length === 0) {
    questionListEl.innerHTML = `
      <div class="no-results">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.35-4.35"/>
        </svg>
        <p>没有找到匹配的对话</p>
      </div>
    `;
    return;
  }

  questions.forEach((question, index) => {
    const itemEl = document.createElement('div');
    itemEl.className = 'question-item';
    itemEl.dataset.index = index;
    itemEl.innerHTML = `
      <span class="question-index">${question.type === 'user' ? '👤' : '#'}${index + 1}</span>
      <div class="question-text">${escapeHtml(question.text)}</div>
      <div class="question-meta">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
          <circle cx="12" cy="10" r="3"/>
        </svg>
        Key: ${escapeHtml(question.key)}
      </div>
    `;

    itemEl.addEventListener('click', () => {
      document.querySelectorAll('.question-item').forEach(el => el.classList.remove('highlighted'));
      itemEl.classList.add('highlighted');
      // 点击时先重新扫描再跳转，确保获取最新 DOM
      scrollToQuestion(question);
    });

    questionListEl.appendChild(itemEl);
  });
}

function filterQuestions(searchText) {
  const text = searchText.toLowerCase().trim();

  if (!text) {
    renderQuestions(cachedQuestions);
    return;
  }

  const filtered = cachedQuestions.filter(q =>
    q.text.toLowerCase().includes(text) ||
    (q.key && q.key.toLowerCase().includes(text))
  );

  renderQuestions(filtered);
}

async function scrollToQuestion(question) {
  const tabId = await getCurrentTabId();

  // 先重新扫描页面获取最新 DOM
  await new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { action: 'rescan' }, (response) => {
      resolve(response);
    });
  });

  // 等待一小段时间让 DOM 稳定
  await new Promise(resolve => setTimeout(resolve, 100));

  // 然后再跳转
  chrome.tabs.sendMessage(tabId, {
    action: 'scrollToQuestion',
    key: question.key
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
