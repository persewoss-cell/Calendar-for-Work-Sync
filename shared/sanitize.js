// Whitelist sanitizer for the small amount of rich text an event line may carry
// (bold / italic / underline / strike / color / font / size). Every tag in the output is
// rebuilt from scratch, so nothing outside the whitelist can survive.

const TAGS = new Set(['b', 'strong', 'i', 'em', 'u', 's', 'strike', 'span', 'font', 'br']);
const STYLE_PROPS = new Set([
  'color', 'background-color', 'font-weight', 'font-style', 'font-family', 'font-size',
  'text-decoration', 'text-decoration-line',
]);
const SAFE_VALUE = /^[#(),.%\w\s'"\-\p{L}]+$/u;

function cleanStyle(style) {
  const out = [];
  for (const decl of style.split(';')) {
    const idx = decl.indexOf(':');
    if (idx < 0) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const value = decl.slice(idx + 1).trim();
    if (!STYLE_PROPS.has(prop) || !SAFE_VALUE.test(value) || /url\s*\(|expression|javascript/i.test(value)) continue;
    out.push(`${prop}: ${value.replace(/"/g, "'")}`);
  }
  return out.join('; ');
}

function attr(attrs, name) {
  const m = attrs.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? (m[2] ?? m[3] ?? m[4] ?? '') : null;
}

const escapeText = (s) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function sanitizeHtml(html, maxLength = 20000) {
  if (!html) return '';
  const parts = String(html).slice(0, maxLength).split(/(<[^>]*>)/);
  let out = '';
  for (const part of parts) {
    if (!part.startsWith('<') || !part.endsWith('>')) {
      out += escapeText(part);
      continue;
    }
    const m = part.match(/^<\s*(\/?)\s*([a-zA-Z0-9]+)([^>]*)>$/);
    if (!m) continue;
    const [, closing, rawTag, attrs] = m;
    const tag = rawTag.toLowerCase();
    if (!TAGS.has(tag)) continue;
    if (tag === 'br') { out += '<br>'; continue; }
    if (closing) { out += `</${tag}>`; continue; }
    let rebuilt = `<${tag}`;
    const style = attr(attrs, 'style');
    if (style) {
      const s = cleanStyle(style);
      if (s) rebuilt += ` style="${s}"`;
    }
    if (tag === 'font') {
      const color = attr(attrs, 'color');
      const face = attr(attrs, 'face');
      if (color && SAFE_VALUE.test(color)) rebuilt += ` color="${color.replace(/"/g, '')}"`;
      if (face && SAFE_VALUE.test(face)) rebuilt += ` face="${face.replace(/"/g, "'")}"`;
    }
    out += `${rebuilt}>`;
  }
  return out;
}

/** Plain text of a sanitized fragment (used for the searchable title). */
export function htmlToText(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .trim();
}
