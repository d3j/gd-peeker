import { loadSettings, resetSettings, saveSettings } from './lib/settings.js';
import { setLang, t } from './lib/messages.js';

let settings = await loadSettings();
setLang(settings.uiLang);
render();

document.querySelector('#reset').addEventListener('click', async () => {
  settings = await resetSettings();
  setLang(settings.uiLang);
  render();
});

document.querySelectorAll('input, select').forEach((input) => {
  input.addEventListener('change', async () => {
    readForm();
    settings = await saveSettings(settings);
    setLang(settings.uiLang);
    applyI18n();
  });
});

function render() {
  document.querySelector('#autoOpen').checked = settings.autoOpen;
  document.querySelectorAll('input[name="autoOpenTypes"]').forEach((input) => {
    input.checked = settings.autoOpenTypes.includes(input.value);
  });
  document.querySelector('#allowScripts').checked = settings.html.allowScripts;
  document.querySelector('#allowExternal').checked = settings.html.allowExternal;
  document.querySelector('#mdPreset').value = settings.md.preset;
  document.querySelector('#mdFootnote').checked = settings.md.plugins.footnote;
  document.querySelector('#mdTaskLists').checked = settings.md.plugins.taskLists;
  document.querySelector('#mdAnchor').checked = settings.md.plugins.anchor;
  document.querySelector('#mdFrontMatter').checked = settings.md.plugins.frontMatter;
  document.querySelector('#mdMermaid').checked = settings.md.plugins.mermaid;
  document.querySelector('#mdToc').checked = settings.md.toc;
  document.querySelector('#mdTheme').value = settings.md.theme;
  document.querySelector('#mdColorScheme').value = settings.md.colorScheme;
  document.querySelector('#wrap').checked = settings.txt.wrap;
  document.querySelector('#lineNumbers').checked = settings.txt.lineNumbers;
  document.querySelector('#fontSize').value = settings.txt.fontSize;
  document.querySelector('#encoding').value = settings.encoding.default;
  document.querySelector('#uiLang').value = settings.uiLang;
  document.querySelector('#version').textContent = `v${chrome.runtime.getManifest().version}`;
  applyI18n();
}

function readForm() {
  settings.autoOpen = document.querySelector('#autoOpen').checked;
  settings.autoOpenTypes = [...document.querySelectorAll('input[name="autoOpenTypes"]:checked')].map((input) => input.value);
  settings.html.allowScripts = document.querySelector('#allowScripts').checked;
  settings.html.allowExternal = document.querySelector('#allowExternal').checked;
  settings.md.preset = document.querySelector('#mdPreset').value;
  settings.md.plugins.footnote = document.querySelector('#mdFootnote').checked;
  settings.md.plugins.taskLists = document.querySelector('#mdTaskLists').checked;
  settings.md.plugins.anchor = document.querySelector('#mdAnchor').checked;
  settings.md.plugins.frontMatter = document.querySelector('#mdFrontMatter').checked;
  settings.md.plugins.mermaid = document.querySelector('#mdMermaid').checked;
  settings.md.toc = document.querySelector('#mdToc').checked;
  settings.md.theme = document.querySelector('#mdTheme').value;
  settings.md.colorScheme = document.querySelector('#mdColorScheme').value;
  settings.txt.wrap = document.querySelector('#wrap').checked;
  settings.txt.lineNumbers = document.querySelector('#lineNumbers').checked;
  settings.txt.fontSize = Number(document.querySelector('#fontSize').value) || 14;
  settings.encoding.default = document.querySelector('#encoding').value;
  settings.uiLang = document.querySelector('#uiLang').value;
}

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.title = t('optionsTitle');
}
