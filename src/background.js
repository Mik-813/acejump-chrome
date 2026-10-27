const CONTENT_FILES = ['src/shared.js', 'src/content.js'];

async function activate(tab) {
  if (!tab?.id) return;
  const message = { type: 'acejump:activate' };
  try {
    await chrome.tabs.sendMessage(tab.id, message);
  } catch {
    // Not injected yet: activeTab (granted by the shortcut/toolbar click) lets us inject on demand.
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: CONTENT_FILES });
      await chrome.tabs.sendMessage(tab.id, message);
    } catch (err) {
      // Restricted pages (chrome://, Web Store, PDF viewer...) cannot be scripted.
      console.warn('AceJump: cannot run on this page.', err?.message ?? err);
      flashBadge(tab.id);
    }
  }
}

function flashBadge(tabId) {
  chrome.action.setBadgeBackgroundColor({ tabId, color: '#cf222e' });
  chrome.action.setBadgeText({ tabId, text: '✕' });
  setTimeout(() => chrome.action.setBadgeText({ tabId, text: '' }), 1500);
}

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'activate') return;
  tab ??= (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  activate(tab);
});

chrome.action.onClicked.addListener(activate);

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') chrome.runtime.openOptionsPage();
});
