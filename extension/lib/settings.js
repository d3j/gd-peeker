export const DEFAULT_SETTINGS = Object.freeze({
  autoOpen: true,
  autoOpenTypes: ['html', 'md', 'txt', 'xml'],
  html: { allowScripts: true, allowExternal: true },
  md: {
    preset: 'gfm',
    plugins: { footnote: true, taskLists: true, anchor: true, frontMatter: true, mermaid: true },
    theme: 'github',
    colorScheme: 'auto',
    toc: false,
  },
  txt: { wrap: true, fontSize: 14, lineNumbers: false },
  encoding: { default: 'auto' },
  uiLang: 'en',
});

const STORAGE_KEY = 'settings';

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

export function cloneDefaults() {
  return structuredClone(DEFAULT_SETTINGS);
}

export function mergeSettings(value, base = DEFAULT_SETTINGS) {
  if (!isPlainObject(value)) return structuredClone(base);
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [key, defaultValue] of Object.entries(base)) {
    if (!(key in value)) {
      out[key] = structuredClone(defaultValue);
      continue;
    }
    if (Array.isArray(defaultValue)) {
      out[key] = Array.isArray(value[key]) ? [...value[key]] : [...defaultValue];
    } else if (isPlainObject(defaultValue)) {
      out[key] = mergeSettings(value[key], defaultValue);
    } else {
      out[key] = value[key];
    }
  }
  return out;
}

export async function loadSettings() {
  const data = await chrome.storage.local.get(STORAGE_KEY);
  return mergeSettings(data[STORAGE_KEY]);
}

export async function saveSettings(settings) {
  const merged = mergeSettings(settings);
  await chrome.storage.local.set({ [STORAGE_KEY]: merged });
  return merged;
}

export async function resetSettings() {
  const settings = cloneDefaults();
  await chrome.storage.local.set({ [STORAGE_KEY]: settings });
  return settings;
}

export function onSettingsChanged(callback) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local' || !changes[STORAGE_KEY]) return;
    callback(mergeSettings(changes[STORAGE_KEY].newValue));
  });
}
