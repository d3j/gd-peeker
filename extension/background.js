import { loadSettings } from './lib/settings.js';
import { setLang, t } from './lib/messages.js';
import { detectFileType, isAutoOpenKind } from './lib/filetype.js';

const openedByDriveTab = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'drive:preview') {
    handlePreview(message, sender.tab).then(sendResponse);
    return true;
  }
  if (message?.type === 'drive:relayFetch') {
    relayFetch(message).then(sendResponse);
    return true;
  }
  return false;
});

chrome.action.onClicked.addListener(async (tab) => {
  const match = parseDrivePreviewUrl(tab?.url);
  if (!match) {
    await chrome.runtime.openOptionsPage();
    return;
  }
  const title = normalizeDriveTitle(tab.title || '');
  await openViewer({ driveTab: tab, fileId: match.fileId, nameHint: title, manual: true });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' || changeInfo.url) updateAction(tabId, tab.url || changeInfo.url);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    await updateAction(tabId, tab.url);
  } catch {
    await updateAction(tabId, '');
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  for (const [driveTabId, state] of openedByDriveTab) {
    if (driveTabId === tabId || state.viewerTabId === tabId) openedByDriveTab.delete(driveTabId);
  }
});

async function handlePreview(message, driveTab) {
  console.debug('[GD-Peeker] preview message', message, 'from tab', driveTab?.id);
  if (!driveTab?.id || !message.fileId) return { ok: false, error: 'no-tab' };
  const settings = await localizedSettings();
  if (!settings.autoOpen) return { ok: true, skipped: 'autoOpen-off' };
  let nameHint = normalizeDriveTitle(message.title || '');
  if (!nameHint) {
    await delay(300);
    try {
      const titleResponse = await chrome.tabs.sendMessage(driveTab.id, { type: 'drive:title?' });
      nameHint = normalizeDriveTitle(titleResponse?.title || '');
    } catch {
      nameHint = '';
    }
  }
  if (!nameHint) return { ok: true, skipped: 'no-title' };
  const detected = detectFileType({ name: nameHint });
  if (!detected.ext) return { ok: true, skipped: 'no-extension' }; // unknown blobs must not auto-open (manual open still works)
  if (!isAutoOpenKind(detected.kind, settings)) return { ok: true, skipped: 'not-target' };
  return openViewer({ driveTab, fileId: message.fileId, nameHint, manual: false });
}

async function openViewer({ driveTab, fileId, nameHint, manual }) {
  const existing = openedByDriveTab.get(driveTab.id);
  if (existing?.fileId === fileId && existing.viewerTabId) {
    try {
      await chrome.tabs.update(existing.viewerTabId, { active: true });
      return { ok: true, reused: true };
    } catch {
      openedByDriveTab.delete(driveTab.id);
    }
  }
  const params = new URLSearchParams({ id: fileId });
  if (nameHint) params.set('name', nameHint);
  params.set('driveTabId', String(driveTab.id));
  if (manual) params.set('manual', '1');
  const viewer = await chrome.tabs.create({
    url: chrome.runtime.getURL(`viewer.html?${params}`),
    openerTabId: driveTab.id,
    index: typeof driveTab.index === 'number' ? driveTab.index + 1 : undefined,
  });
  openedByDriveTab.set(driveTab.id, { fileId, viewerTabId: viewer.id });
  return { ok: true, viewerTabId: viewer.id };
}

async function relayFetch({ fileId, driveTabId }) {
  // Number(null) is 0, which would look like a valid tab id
  const numericTabId = driveTabId == null || driveTabId === '' ? NaN : Number(driveTabId);
  if (!fileId || !Number.isFinite(numericTabId)) return { ok: false, error: 'no-drive-tab' };
  try {
    return await chrome.tabs.sendMessage(numericTabId, { type: 'drive:fetch', fileId });
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}

async function updateAction(tabId, url) {
  const match = parseDrivePreviewUrl(url);
  const settings = await localizedSettings();
  await chrome.action.setBadgeText({ tabId, text: match ? '●' : '' });
  await chrome.action.setTitle({ tabId, title: match ? t('actionOpen') : t('actionSettings') });
  return settings;
}

async function localizedSettings() {
  const settings = await loadSettings();
  setLang(settings.uiLang);
  return settings;
}

function parseDrivePreviewUrl(url) {
  if (!url) return null;
  const fileMatch = /^https:\/\/drive\.google\.com\/file\/d\/([\w-]+)\/(?:view|preview)/.exec(url);
  if (fileMatch) return { fileId: fileMatch[1] };
  if (!/^https:\/\/drive\.google\.com\/(?:open|uc)\?/.test(url)) return null;
  const parsed = new URL(url);
  const fileId = parsed.searchParams.get('id');
  return fileId ? { fileId } : null;
}

function normalizeDriveTitle(title) {
  return String(title).replace(/\s+-\s+Google Drive\s*$/i, '').trim();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
