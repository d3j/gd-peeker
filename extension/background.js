import { loadSettings } from './lib/settings.js';
import { setLang, t } from './lib/messages.js';
import { detectFileType, isAutoOpenKind } from './lib/filetype.js';
import { sniffDriveFile } from './lib/drivefetch.js';
import { fileIdFromDriveRequestUrl } from './lib/driveurl.js';

const PREVIEW_TTL_MS = 30 * 60 * 1000;
const REQUEST_DEDUPE_MS = 10 * 1000;
const recentRequests = new Map();

chrome.webRequest.onBeforeRequest.addListener(
  handleDriveRequest,
  {
    urls: [
      'https://drive.google.com/file/*/d/*/docos/p/sync*',
      'https://drive.google.com/drivesharing/clientmodel?id=*',
    ],
    types: ['xmlhttprequest'],
  }
);

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
  const urlMatch = parseDrivePreviewUrl(tab?.url);
  if (urlMatch) {
    await openViewerFromSniff({ driveTab: tab, fileId: urlMatch.fileId, manual: true });
    return;
  }

  const preview = await getFreshPreview(tab?.id);
  if (preview) {
    await openViewer({
      driveTab: tab,
      fileId: preview.fileId,
      nameHint: preview.fileName,
      manual: true,
    });
    return;
  }

  await chrome.runtime.openOptionsPage();
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
  removeTabState(tabId);
});

async function handleDriveRequest(details) {
  console.debug('[GD-Peeker] webRequest', details.type, 'tab', details.tabId, details.url);
  if (details.tabId < 0) return;
  const fileId = fileIdFromDriveRequestUrl(details.url);
  if (!fileId || isRecentRequest(details.tabId, fileId)) return;
  try {
    const tab = await chrome.tabs.get(details.tabId);
    await handleDetectedFile(tab, fileId);
  } catch (err) {
    console.debug('[GD-Peeker] webRequest preview failed', err?.message ?? String(err));
  }
}

async function handlePreview(message, driveTab) {
  console.debug('[GD-Peeker] preview message', message, 'from tab', driveTab?.id);
  if (typeof driveTab?.id !== 'number' || !message.fileId) return { ok: false, error: 'no-tab' };
  return handleDetectedFile(driveTab, message.fileId);
}

async function handleDetectedFile(driveTab, fileId) {
  const settings = await localizedSettings();
  const sniff = await sniffDriveFile(fileId);
  console.debug('[GD-Peeker] sniff', fileId, sniff);
  if (!sniff.ok || !sniff.fileName) return { ok: true, skipped: sniff.error || 'sniff-failed' };

  const detected = detectFileType({ name: sniff.fileName, mime: sniff.contentType });
  await setPreview(driveTab.id, {
    fileId,
    fileName: sniff.fileName,
    kind: detected.kind,
    at: Date.now(),
  });
  await updateAction(driveTab.id, driveTab.url);
  if (!settings.autoOpen) return { ok: true, skipped: 'autoOpen-off' };
  if (!detected.ext) return { ok: true, skipped: 'no-extension' };
  if (!isAutoOpenKind(detected.kind, settings)) return { ok: true, skipped: 'not-target' };
  return openViewer({ driveTab, fileId, nameHint: sniff.fileName, manual: false });
}

async function openViewerFromSniff({ driveTab, fileId, manual }) {
  const sniff = await sniffDriveFile(fileId);
  const nameHint = sniff.ok && sniff.fileName ? sniff.fileName : fileId;
  return openViewer({ driveTab, fileId, nameHint, manual });
}

async function openViewer({ driveTab, fileId, nameHint, manual }) {
  if (typeof driveTab?.id !== 'number') return { ok: false, error: 'no-tab' };
  const opened = await getOpenedByDriveTab();
  const existing = opened[String(driveTab.id)];
  if (existing?.fileId === fileId && existing.viewerTabId) {
    try {
      await chrome.tabs.update(existing.viewerTabId, { active: true });
      return { ok: true, reused: true };
    } catch {
      delete opened[String(driveTab.id)];
      await setOpenedByDriveTab(opened);
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
  opened[String(driveTab.id)] = { fileId, viewerTabId: viewer.id };
  await setOpenedByDriveTab(opened);
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
  if (typeof tabId !== 'number') return;
  const match = parseDrivePreviewUrl(url);
  const preview = await getPreview(tabId);
  await localizedSettings();
  const active = Boolean(match || preview);
  await chrome.action.setBadgeText({ tabId, text: active ? '●' : '' });
  await chrome.action.setTitle({ tabId, title: active ? t('actionOpen') : t('actionSettings') });
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

function isRecentRequest(tabId, fileId) {
  const key = `${tabId}:${fileId}`;
  const now = Date.now();
  const last = recentRequests.get(key) ?? 0;
  recentRequests.set(key, now);
  return now - last < REQUEST_DEDUPE_MS;
}

async function getPreviewByTab() {
  return (await chrome.storage.session.get({ previewByTab: {} })).previewByTab || {};
}

async function setPreview(tabId, preview) {
  const previews = await getPreviewByTab();
  previews[String(tabId)] = preview;
  await chrome.storage.session.set({ previewByTab: previews });
}

async function getPreview(tabId) {
  if (typeof tabId !== 'number') return null;
  const previews = await getPreviewByTab();
  return previews[String(tabId)] || null;
}

async function getFreshPreview(tabId) {
  const preview = await getPreview(tabId);
  if (!preview) return null;
  return Date.now() - preview.at <= PREVIEW_TTL_MS ? preview : null;
}

async function getOpenedByDriveTab() {
  return (await chrome.storage.session.get({ openedByDriveTab: {} })).openedByDriveTab || {};
}

async function setOpenedByDriveTab(openedByDriveTab) {
  await chrome.storage.session.set({ openedByDriveTab });
}

async function removeTabState(tabId) {
  const key = String(tabId);
  const [previews, opened] = await Promise.all([getPreviewByTab(), getOpenedByDriveTab()]);
  delete previews[key];
  for (const [driveTabId, state] of Object.entries(opened)) {
    if (driveTabId === key || state.viewerTabId === tabId) delete opened[driveTabId];
  }
  await chrome.storage.session.set({ previewByTab: previews, openedByDriveTab: opened });
}
