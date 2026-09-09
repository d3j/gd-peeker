const LABELS = new Map([
  ['auto', 'auto'],
  ['utf-8', 'utf-8'],
  ['utf8', 'utf-8'],
  ['shift_jis', 'shift_jis'],
  ['shift-jis', 'shift_jis'],
  ['sjis', 'shift_jis'],
  ['euc-jp', 'euc-jp'],
  ['euc_jp', 'euc-jp'],
  ['utf-16le', 'utf-16le'],
  ['utf-16be', 'utf-16be'],
  ['iso-8859-1', 'windows-1252'],
  ['windows-1252', 'windows-1252'],
]);

export function decode(bytes, override = 'auto') {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const requested = normalizeEncoding(override);
  if (requested && requested !== 'auto') {
    return {
      text: decodeWith(data, requested, false),
      encoding: requested,
      confidence: 'override',
      hadBom: hasAnyBom(data),
    };
  }

  const bom = detectBom(data);
  if (bom) {
    return {
      text: decodeWith(data.slice(bom.offset), bom.encoding, false),
      encoding: bom.encoding,
      confidence: 'bom',
      hadBom: true,
    };
  }

  try {
    return {
      text: decodeWith(data, 'utf-8', true),
      encoding: 'utf-8',
      confidence: 'strict',
      hadBom: false,
    };
  } catch {}

  const scored = ['shift_jis', 'euc-jp'].map((encoding) => {
    const text = decodeWith(data, encoding, false);
    return { encoding, text, score: scoreJapaneseText(text) };
  });
  scored.sort((a, b) => b.score - a.score || (a.encoding === 'shift_jis' ? -1 : 1));

  if (scored[0].score > 0) {
    return {
      text: scored[0].text,
      encoding: scored[0].encoding,
      confidence: 'heuristic',
      hadBom: false,
    };
  }

  return {
    text: decodeWith(data, 'windows-1252', false),
    encoding: 'windows-1252',
    confidence: 'fallback',
    hadBom: false,
  };
}

export function displayEncodingName(encoding) {
  const names = {
    'utf-8': 'UTF-8',
    shift_jis: 'Shift_JIS',
    'euc-jp': 'EUC-JP',
    'utf-16le': 'UTF-16LE',
    'utf-16be': 'UTF-16BE',
    'windows-1252': 'Windows-1252',
  };
  return names[encoding] || encoding || '';
}

export function normalizeEncoding(value) {
  return LABELS.get(String(value || 'auto').trim().toLowerCase()) || 'utf-8';
}

function detectBom(data) {
  if (startsWith(data, [0xef, 0xbb, 0xbf])) return { encoding: 'utf-8', offset: 3 };
  if (startsWith(data, [0xff, 0xfe])) return { encoding: 'utf-16le', offset: 2 };
  if (startsWith(data, [0xfe, 0xff])) return { encoding: 'utf-16be', offset: 2 };
  return null;
}

function hasAnyBom(data) {
  return Boolean(detectBom(data));
}

function startsWith(data, prefix) {
  return prefix.every((byte, index) => data[index] === byte);
}

function decodeWith(data, encoding, fatal) {
  return new TextDecoder(encoding, { fatal }).decode(data);
}

function scoreJapaneseText(text) {
  const replacement = countMatches(text, /\uFFFD/g);
  const japanese = countMatches(text, /[\u3040-\u30ff\u4e00-\u9fff]/g);
  const controls = countMatches(text, /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g);
  const halfKanaRuns = countMatches(text, /[\uff61-\uff9f]{4,}/g);
  const mojibake = countMatches(text, /[縺繧譁髱蜊荳莠譛]/g);
  return japanese * 8 - replacement * 80 - controls * 25 - halfKanaRuns * 8 - mojibake * 3;
}

function countMatches(text, pattern) {
  return text.match(pattern)?.length || 0;
}
