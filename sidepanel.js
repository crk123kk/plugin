let cachedQuestions = [];
let currentScanMode = 'data-virtual-list-item-key';

document.addEventListener('DOMContentLoaded', () => {
  // 加载保存的模式并自动扫描
  loadScanMode().then(() => {
    forceRescan();
  });

  document.getElementById('refreshBtn').addEventListener('click', () => {
    forceRescan();
  });

  document.getElementById('searchInput').addEventListener('input', (e) => {
    filterQuestions(e.target.value);
  });

  // 自定义下拉框交互
  const customSelect = document.getElementById('customModeSelect');
  const modeSelectLabel = document.getElementById('modeSelectLabel');
  const modeSelectOptions = document.getElementById('modeSelectOptions');
  const customOptions = modeSelectOptions.querySelectorAll('.custom-option');

  customSelect.addEventListener('click', (e) => {
    e.stopPropagation();
    customSelect.classList.toggle('open');
  });

  customOptions.forEach((option) => {
    option.addEventListener('click', (e) => {
      e.stopPropagation();
      const selectedValue = option.dataset.value;

      // 更新选中状态
      customOptions.forEach((opt) => opt.classList.remove('selected'));
      option.classList.add('selected');

      // 更新显示文本
      modeSelectLabel.textContent = option.textContent;

      // 更新扫描模式并刷新
      currentScanMode = selectedValue;
      saveScanMode().then(() => {
        forceRescan();
      });

      // 关闭下拉框
      customSelect.classList.remove('open');
    });
  });

  // 点击外部关闭下拉框
  document.addEventListener('click', () => {
    customSelect.classList.remove('open');
  });
});

// 保存扫描模式到 chrome storage
async function saveScanMode() {
  try {
    await chrome.storage.local.set({ scanMode: currentScanMode });
  } catch (error) {
    console.error('保存模式失败:', error);
  }
}

// 从 chrome storage 加载扫描模式
async function loadScanMode() {
  try {
    const result = await chrome.storage.local.get(['scanMode']);
    if (result.scanMode) {
      currentScanMode = result.scanMode;
      // 更新自定义下拉框显示
      const modeSelectLabel = document.getElementById('modeSelectLabel');
      const customOptions = document.querySelectorAll('.custom-option');
      const selectedOption = document.querySelector(`.custom-option[data-value="${currentScanMode}"]`);

      if (modeSelectLabel) {
        modeSelectLabel.textContent = currentScanMode === 'data-virtual-list-item-key' ? 'deepseek' : 'GPT';
      }

      if (selectedOption) {
        customOptions.forEach((opt) => opt.classList.remove('selected'));
        selectedOption.classList.add('selected');
      }
    }
  } catch (error) {
    console.error('加载模式失败:', error);
  }
  return;
}

// 更新模式徽章显示
function updateModeBadge() {
  // 自定义下拉框已直接处理显示
}

// 获取当前活动标签页 ID
async function getCurrentTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab.id;
}

// 强制重新扫描页面 - 使用 executeScript 直接执行扫描
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
      <p>正在扫描页面...</p>
    </div>
  `;
  emptyStateEl.style.display = 'none';

  try {
    const tabId = await getCurrentTabId();

    // 使用 executeScript 直接在页面中执行扫描代码
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: scanPage,
      args: [currentScanMode]
    });

    if (result && result[0] && result[0].result) {
      const response = result[0].result;
      if (response.questions && response.questions.length > 0) {
        cachedQuestions = response.questions;
        questionCountEl.textContent = `共 ${response.questions.length} 条记录`;
        renderQuestions(response.questions);
        emptyStateEl.style.display = 'none';
      } else {
        cachedQuestions = [];
        questionCountEl.textContent = '共 0 条记录';
        questionListEl.innerHTML = '';
        emptyStateEl.style.display = 'flex';
      }
    }

  } catch (error) {
    console.error('扫描失败:', error);
    questionListEl.innerHTML = `
      <div class="loading">
        <p>扫描失败，请重试</p>
      </div>
    `;
  }
}

// 在页面中执行的扫描函数（会被序列化执行）
function scanPage(scanMode) {
  // 扫描函数
  function scanQuestions(mode) {
    const results = [];

    if (mode === 'data-virtual-list-item-key') {
      const elements = document.querySelectorAll('[data-virtual-list-item-key]');

      elements.forEach((el) => {
        const text = el.textContent?.trim();
        if (text && text.length > 0 && text.length < 1000) {
          const key = el.getAttribute('data-virtual-list-item-key');

          results.push({
            id: key,
            key: key,
            text: text.substring(0, 300),
            selector: `[data-virtual-list-item-key="${key}"]`,
            mode: 'key'
          });
        }
      });
    } else if (mode === 'data-turn') {
      // Turn 模式：扫描 data-turn="user" 的元素
      const userElements = document.querySelectorAll('[data-turn="user"]');

      userElements.forEach((el) => {
        // 优先获取 data-turn-id，如果没有则使用 data-message-id
        let turnId = el.getAttribute('data-turn-id');
        const messageId = el.getAttribute('data-message-id');

        if (!turnId && messageId) {
          turnId = messageId;
        }

        if (!turnId) {
          turnId = `turn_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
        }

        // 查找内部的文本内容
        // 优先从 .user-message-bubble-color 或 [data-message-id] 中获取
        let textEl = el.querySelector('.user-message-bubble-color');
        if (!textEl) {
          textEl = el.querySelector('[data-message-id]');
        }
        const text = textEl ? textEl.textContent?.trim() : el.textContent?.trim();

        if (text && text.length > 0 && text.length < 1000) {
          // 构建选择器
          let selector = `[data-turn="user"]`;
          if (el.getAttribute('data-turn-id')) {
            selector += `[data-turn-id="${el.getAttribute('data-turn-id')}"]`;
          } else if (el.getAttribute('data-message-id')) {
            selector += `[data-message-id="${el.getAttribute('data-message-id')}"]`;
          }
          // 如果是 section 标签，加上标签名
          if (el.tagName.toLowerCase() === 'section') {
            selector = `section${selector}`;
          }

          results.push({
            id: turnId,
            key: turnId,
            text: text.substring(0, 300),
            selector: selector,
            mode: 'turn',
            type: 'user',
            tagName: el.tagName.toLowerCase()
          });
        }
      });
    }

    return results;
  }

  const questions = scanQuestions(scanMode);

  return {
    success: true,
    count: questions.length,
    questions: questions
  };
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

    // 使用 executeScript 直接在页面中执行扫描代码
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: scanPage,
      args: [currentScanMode]
    });

    if (result && result[0] && result[0].result) {
      const response = result[0].result;
      if (response.questions && response.questions.length > 0) {
        cachedQuestions = response.questions;
        questionCountEl.textContent = `共 ${response.questions.length} 条记录`;
        renderQuestions(response.questions);
        emptyStateEl.style.display = 'none';
      } else {
        cachedQuestions = [];
        questionCountEl.textContent = '共 0 条记录';
        questionListEl.innerHTML = '';
        emptyStateEl.style.display = 'flex';
      }
    }

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
      <span class="question-index">${index + 1}</span>
      <div class="question-content">
        <div class="question-text">${escapeHtml(question.text)}</div>
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

  try {
    // 使用 executeScript 直接执行滚动操作
    await chrome.scripting.executeScript({
      target: { tabId },
      func: scrollToElement,
      args: [question.key, currentScanMode]
    });
  } catch (error) {
    console.error('跳转失败:', error);
  }
}

// 在页面中执行的滚动函数
function scrollToElement(key, scanMode) {
  // 移除之前的高亮
  document.querySelectorAll('.dialog-highlight').forEach(el => {
    el.classList.remove('dialog-highlight');
    el.style.outline = '';
    el.style.outlineOffset = '';
  });

  let element = null;

  // 根据模式查找元素
  if (scanMode === 'data-virtual-list-item-key') {
    element = document.querySelector(`[data-virtual-list-item-key="${key}"]`);
  } else if (scanMode === 'data-turn') {
    // Turn 模式：从 key 中提取 messageId
    // key 格式：user_{messageId}_{random}
    const match = key.match(/user_([^_]+)_[a-z0-9]+$/);
    const messageId = match ? match[1] : key;

    // 优先使用 data-message-id 查找
    element = document.querySelector(`[data-turn="user"][data-message-id="${messageId}"]`);

    // 如果没找到，尝试使用 data-turn-id
    if (!element) {
      element = document.querySelector(`[data-turn="user"][data-turn-id="${messageId}"]`);
    }

    // 还是没找到，就找第一个 data-turn="user" 元素
    if (!element) {
      element = document.querySelector('[data-turn="user"]');
    }
  }

  if (element) {
    // 滚动到元素
    element.scrollIntoView({ behavior: 'auto', block: 'center' });

    // 添加高亮样式
    element.classList.add('dialog-highlight');
    element.style.transition = 'all 0.3s';
    element.style.outline = '3px solid #667eea';
    element.style.outlineOffset = '2px';
    element.style.borderRadius = '4px';
    element.style.backgroundColor = 'rgba(102, 126, 234, 0.1)';

    // 2 秒后移除高亮
    setTimeout(() => {
      element.style.outline = '';
      element.style.outlineOffset = '';
      element.style.backgroundColor = '';
      element.classList.remove('dialog-highlight');
    }, 2000);

    return true;
  }

  return false;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
