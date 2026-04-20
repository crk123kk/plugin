// 对话助手 - Content Script
// 使用 IIFE 避免重复注入时的变量冲突

(function() {
  // 存储页面中的对话元素引用
  let questionElementsMap = new Map();
  // 当前扫描模式
  let currentScanMode = 'data-virtual-list-item-key';

  // 初始化：扫描页面中的对话
  function scanQuestions(mode) {
    const scanMode = mode || currentScanMode;
    currentScanMode = scanMode;
    questionElementsMap.clear();

    if (scanMode === 'data-virtual-list-item-key') {
      const elements = document.querySelectorAll('[data-virtual-list-item-key]');

      elements.forEach((el) => {
        const text = el.textContent?.trim();

        if (text && text.length > 0 && text.length < 1000) {
          const key = el.getAttribute('data-virtual-list-item-key');

          const selector = `[data-virtual-list-item-key="${key}"]`;

          questionElementsMap.set(key, {
            id: key,
            key: key,
            text: text.substring(0, 300),
            selector: selector,
            mode: 'key'
          });
        }
      });
    } else if (scanMode === 'data-turn') {
      // Turn 模式：只扫描 data-turn="user"
      const userElements = document.querySelectorAll('[data-turn="user"]');

      userElements.forEach((el) => {
        const text = el.textContent?.trim();

        if (text && text.length > 0 && text.length < 1000) {
          // 生成唯一标识
          const messageId = el.getAttribute('data-message-id') || Date.now();
          const key = `user_${messageId}_${Math.random().toString(36).substring(2, 11)}`;
          const selector = `[data-turn="user"][data-message-id="${messageId}"]`;

          questionElementsMap.set(key, {
            id: key,
            key: key,
            text: text.substring(0, 300),
            selector: selector,
            mode: 'turn',
            type: 'user'
          });
        }
      });
    }

    console.log(`[对话助手] 扫描模式：${scanMode}, 扫描到 ${questionElementsMap.size} 条对话`);
    return Array.from(questionElementsMap.values());
  }

  // 高亮并滚动到元素
  function highlightAndScroll(key, mode) {
    const scanMode = mode || currentScanMode;

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
      // 使用 requestAnimationFrame 确保在下一帧执行
      requestAnimationFrame(() => {
        // 使用 auto 而不是 smooth，避免被动态内容打断
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
      });

      return true;
    }

    return false;
  }

  // 监听消息
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getQuestions') {
      const questions = scanQuestions(request.mode);
      sendResponse({ questions: questions });
    }

    if (request.action === 'scrollToQuestion') {
      const found = highlightAndScroll(request.key, request.mode);
      sendResponse({ success: found });
    }

    if (request.action === 'rescan') {
      const questions = scanQuestions(request.mode);
      sendResponse({
        success: true,
        count: questions.length,
        questions: questions
      });
    }

    return true;
  });

  // 页面加载完成后自动扫描
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    scanQuestions();
  } else {
    document.addEventListener('DOMContentLoaded', scanQuestions);
  }

  console.log('[对话助手] Content script 已加载');
})();
