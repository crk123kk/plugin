// 点击插件图标时打开侧边栏
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ windowId: tab.windowId });
});

console.log('[提问助手] Background script 已加载');
