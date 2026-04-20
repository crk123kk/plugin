// 对话助手 - Content Script
// 使用 IIFE 避免重复注入时的变量冲突

(function() {
  // 存储页面中的对话元素引用
  let questionElementsMap = new Map();

  // 初始化：扫描页面中的对话
  function scanQuestions() {
    questionElementsMap.clear();

    // 使用 data-virtual-list-item-key 属性来收集节点
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
          selector: selector
        });
      }
    });

    // 使用 data-turn="user" 属性来收集用户对话节点
    const userElements = document.querySelectorAll('[data-turn="user"]');

    userElements.forEach((el) => {
      const text = el.textContent?.trim();

      if (text && text.length > 0 && text.length < 1000) {
        // 生成唯一标识
        const messageId = el.getAttribute('data-message-id') || Date.now();
        const key = `user_${messageId}_${Math.random().toString(36).substr(2, 9)}`;
        const selector = `[data-turn="user"][data-message-id="${messageId}"]`;

        questionElementsMap.set(key, {
          id: key,
          key: key,
          text: text.substring(0, 300),
          selector: selector,
          type: 'user'
        });
      }
    });

    console.log(`[对话助手] 扫描到 ${questionElementsMap.size} 条对话`);
    return Array.from(questionElementsMap.values());
  }

  // 高亮并滚动到元素（增强版，支持动态内容）
  function highlightAndScroll(key) {
    // 移除之前的高亮
    document.querySelectorAll('.dialog-highlight').forEach(el => {
      el.classList.remove('dialog-highlight');
      el.style.outline = '';
      el.style.outlineOffset = '';
    });

    let element = null;

    // 尝试多种选择器查找元素
    // 1. 先尝试 data-virtual-list-item-key
    element = document.querySelector(`[data-virtual-list-item-key="${key}"]`);

    // 2. 如果是 user_ 开头的 key，尝试 data-turn="user"
    if (!element && key.startsWith('user_')) {
      // 尝试匹配 data-message-id
      const match = key.match(/user_([^_]+)_[a-z0-9]+$/);
      if (match && match[1]) {
        element = document.querySelector(`[data-turn="user"][data-message-id="${match[1]}"]`);
      }
      // 如果还是没有，就找第一个 data-turn="user" 元素
      if (!element) {
        element = document.querySelector('[data-turn="user"]');
      }
    }

    // 尝试多次滚动，因为内容可能在动态生成
    let attempts = 0;
    const maxAttempts = 10;
    let lastScrollTop = 0;

    function tryScroll() {
      if (!element) {
        element = document.querySelector(`[data-virtual-list-item-key="${key}"]`);
      }
      if (!element && key.startsWith('user_')) {
        element = document.querySelector('[data-turn="user"]');
      }

      if (element) {
        // 检查页面是否还在滚动（判断是否内容还在生成）
        const currentScrollTop = window.scrollY;
        if (Math.abs(currentScrollTop - lastScrollTop) > 50) {
          // 页面还在大幅滚动，等待一下
          lastScrollTop = currentScrollTop;
          attempts++;
          if (attempts < maxAttempts) {
            setTimeout(tryScroll, 150);
            return false;
          }
        }

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
      } else {
        // 元素还没渲染，继续尝试
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(tryScroll, 200);
          return false;
        }
        return false;
      }
    }

    return tryScroll();
  }

  // 监听消息
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getQuestions') {
      const questions = scanQuestions();
      sendResponse({ questions: questions });
    }

    if (request.action === 'scrollToQuestion') {
      const found = highlightAndScroll(request.key);
      sendResponse({ success: found });
    }

    if (request.action === 'rescan') {
      const questions = scanQuestions();
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
