document.addEventListener('DOMContentLoaded', () => {
  loadQuestions();

  document.getElementById('refreshBtn').addEventListener('click', () => {
    loadQuestions();
  });
});

async function loadQuestions() {
  const questionListEl = document.getElementById('questionList');
  const emptyStateEl = document.getElementById('emptyState');

  questionListEl.innerHTML = '<div class="loading">正在加载...</div>';
  emptyStateEl.style.display = 'none';

  try {
    // 获取当前活动标签页
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // 向 content script 发送消息获取问题列表
    chrome.tabs.sendMessage(tab.id, { action: 'getQuestions' }, (response) => {
      if (chrome.runtime.lastError) {
        questionListEl.innerHTML = '<div class="loading">请刷新页面后重试</div>';
        return;
      }

      if (response && response.questions && response.questions.length > 0) {
        renderQuestions(response.questions);
        emptyStateEl.style.display = 'none';
      } else {
        questionListEl.innerHTML = '';
        emptyStateEl.style.display = 'block';
      }
    });
  } catch (error) {
    console.error('加载问题失败:', error);
    questionListEl.innerHTML = '<div class="loading">加载失败，请重试</div>';
  }
}

function renderQuestions(questions) {
  const questionListEl = document.getElementById('questionList');
  questionListEl.innerHTML = '';

  questions.forEach((question, index) => {
    const itemEl = document.createElement('div');
    itemEl.className = 'question-item';
    itemEl.innerHTML = `
      <span class="question-index">#${index + 1}</span>
      <div class="question-text">${escapeHtml(question.text)}</div>
      ${question.selector ? `<div class="question-meta">位置：${question.selector}</div>` : ''}
    `;

    itemEl.addEventListener('click', () => {
      scrollToQuestion(question);
    });

    questionListEl.appendChild(itemEl);
  });
}

function scrollToQuestion(question) {
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    chrome.tabs.sendMessage(tab.id, {
      action: 'scrollToQuestion',
      selector: question.selector,
      id: question.id
    });
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
