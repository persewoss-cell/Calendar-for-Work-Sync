import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './Icon.jsx';
import { FONTS } from '../lib/settings.js';
import { htmlToText, sanitizeHtml } from '../../../shared/sanitize.js';
import { parts } from '../lib/date.js';

const TEXT_COLORS = ['#000000', '#5f6368', '#ffffff', '#e53935', '#fb8c00', '#fdd835', '#43a047', '#00acc1', '#1e88e5', '#3949ab', '#8e24aa', '#d81b60'];
const CELL_COLORS = ['#ef9a9a', '#ffcc80', '#fff59d', '#c5e1a5', '#80cbc4', '#4dd0e1', '#81d4fa', '#9fa8da', '#ce93d8', '#f48fb1', '#bcaaa4', '#b0bec5'];

const escapeHtml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s) => escapeHtml(s).replace(/"/g, '&quot;');

function initialHtml(items) {
  if (!items.length) return '<div class="ln"><br></div>';
  return items.map((it) => {
    const body = (it.html ? sanitizeHtml(it.html) : escapeHtml(it.title)) || '<br>';
    return `<div class="ln" data-key="${escapeAttr(it.key)}"${it.done ? ' data-done="1"' : ''}>${body}</div>`;
  }).join('');
}

/** Read the editor DOM back into lines: [{ key, html, text, done }]. */
function collectLines(root) {
  const lines = [];
  let pending = null;
  const flush = () => {
    if (pending) lines.push(pending);
    pending = null;
  };
  const visit = (node) => {
    if (node.nodeType === 1 && (node.tagName === 'DIV' || node.tagName === 'P')) {
      flush();
      const hasBlocks = [...node.children].some((c) => c.tagName === 'DIV' || c.tagName === 'P');
      if (hasBlocks) {
        node.childNodes.forEach(visit);
        flush();
      } else {
        lines.push({ key: node.dataset.key || null, done: node.dataset.done === '1', html: node.innerHTML });
      }
    } else {
      pending ||= { key: null, done: false, html: '' };
      pending.html += node.nodeType === 3 ? escapeHtml(node.textContent) : node.outerHTML;
    }
  };
  root.childNodes.forEach(visit);
  flush();
  const seen = new Set();
  return lines
    .map((l) => {
      const html = sanitizeHtml(l.html.replace(/(<br\s*\/?>\s*)+$/i, ''));
      const key = l.key && !seen.has(l.key) ? l.key : null;
      if (key) seen.add(key);
      return { key, done: l.done, html, text: htmlToText(html) };
    })
    .filter((l) => l.text);
}

function exec(cmd, value) {
  document.execCommand('styleWithCSS', false, true);
  document.execCommand(cmd, false, value);
}

function Palette({ colors, onPick, allowNone, title }) {
  return (
    <div className="de-palette" onMouseDown={(e) => e.preventDefault()}>
      <div className="de-palette-title">{title}</div>
      <div className="de-swatches">
        {allowNone && (
          <button type="button" className="de-swatch none" title="없음" onClick={() => onPick('')}><Icon name="x" size={12} /></button>
        )}
        {colors.map((c) => <button type="button" key={c} className="de-swatch" style={{ background: c }} title={c} onClick={() => onPick(c)} />)}
      </div>
      <label className="de-custom">
        직접 고르기 <input type="color" onChange={(e) => onPick(e.target.value)} />
      </label>
    </div>
  );
}

/**
 * Popup editor that opens when a date cell is double-clicked.
 * Enter saves and closes, Ctrl+Enter starts a new line (a new item).
 */
export function DayEditor({ date, items, s, anchorRect, dayBg, compact, onSave, onClose, onSetBg, onCycleList, onOpenDetail }) {
  const root = useRef(null);
  const box = useRef(null);
  const saving = useRef(false);
  const [pos, setPos] = useState({ left: -9999, top: -9999 });
  const [menu, setMenu] = useState(null); // 'color' | 'bg' | 'font'
  const [state, setState] = useState({ bold: false, italic: false, underline: false, strike: false, color: '#000000', size: 11 });
  const [, m, d] = parts(date);
  const [y] = parts(date);

  useLayoutEffect(() => {
    root.current.innerHTML = initialHtml(items);
    document.execCommand('defaultParagraphSeparator', false, 'div');
    const el = root.current;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el.lastChild || el);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    const w = box.current.offsetWidth;
    const h = box.current.offsetHeight;
    if (compact || !anchorRect) {
      setPos({ left: Math.max(8, (window.innerWidth - w) / 2), top: Math.max(8, window.innerHeight * 0.12) });
      return;
    }
    const left = Math.min(Math.max(8, anchorRect.left), window.innerWidth - w - 8);
    let top = anchorRect.top + 26;
    if (top + h > window.innerHeight - 8) top = Math.max(8, window.innerHeight - h - 8);
    setPos({ left, top });
  }, [anchorRect, compact]);

  const save = async ({ close = true, detailIndex = null } = {}) => {
    if (saving.current) return;
    saving.current = true;
    const lines = collectLines(root.current);
    const keys = await onSave(lines);
    if (detailIndex != null) onOpenDetail(keys?.[detailIndex] ?? null);
    else if (close) onClose();
  };

  // Click outside → save and close.
  useEffect(() => {
    const onDown = (e) => {
      if (box.current && !box.current.contains(e.target)) save();
    };
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  });

  const currentLine = () => {
    const sel = window.getSelection();
    let node = sel?.anchorNode;
    if (!node || !root.current.contains(node)) return null;
    while (node && node.parentNode !== root.current) node = node.parentNode;
    return node?.nodeType === 1 ? node : null;
  };

  const selectedLines = () => {
    const sel = window.getSelection();
    if (!sel.rangeCount) return [];
    const range = sel.getRangeAt(0);
    const lines = [...root.current.children].filter((l) => range.intersectsNode(l));
    return lines.length ? lines : [currentLine()].filter(Boolean);
  };

  const selectWholeLineIfCollapsed = () => {
    const sel = window.getSelection();
    if (!sel.isCollapsed) return;
    const line = currentLine();
    if (!line) return;
    const range = document.createRange();
    range.selectNodeContents(line);
    sel.removeAllRanges();
    sel.addRange(range);
  };

  const refreshState = () => {
    const sel = window.getSelection();
    if (!sel?.anchorNode || !root.current?.contains(sel.anchorNode)) return;
    const el = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
    const px = parseFloat(getComputedStyle(el).fontSize) || 14;
    setState({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      strike: document.queryCommandState('strikeThrough'),
      color: getComputedStyle(el).color,
      size: Math.round(px * 0.75),
    });
  };

  useEffect(() => {
    document.addEventListener('selectionchange', refreshState);
    return () => document.removeEventListener('selectionchange', refreshState);
  });

  const newLine = () => {
    document.execCommand('insertParagraph');
    // The browser copies the previous line's attributes onto the new line — the new line is a new item.
    const line = currentLine();
    if (line) {
      const prev = line.previousElementSibling;
      if (prev && prev.dataset.key && prev.dataset.key === line.dataset.key) {
        delete line.dataset.key;
        delete line.dataset.done;
      }
      line.classList.add('ln');
    }
  };

  const onKeyDown = (e) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return; // Korean IME composing
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey || e.shiftKey || compact) newLine();
      else save();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      save();
    } else if ((e.ctrlKey || e.metaKey) && ['b', 'i', 'u'].includes(e.key.toLowerCase())) {
      e.preventDefault();
      exec({ b: 'bold', i: 'italic', u: 'underline' }[e.key.toLowerCase()]);
      refreshState();
    }
  };

  const setSize = (pt) => {
    const size = Math.min(48, Math.max(6, Number(pt) || 11));
    selectWholeLineIfCollapsed();
    exec('fontSize', '7');
    root.current.querySelectorAll('span[style*="xxx-large"], font[size="7"]').forEach((el) => {
      el.style.fontSize = `${size}pt`;
      el.removeAttribute('size');
    });
    setState((st) => ({ ...st, size }));
  };

  const toggleDone = () => {
    const lines = selectedLines();
    const allDone = lines.every((l) => l.dataset.done === '1');
    lines.forEach((l) => { if (allDone) delete l.dataset.done; else l.dataset.done = '1'; });
  };

  const clearFormat = () => {
    selectWholeLineIfCollapsed();
    exec('removeFormat');
    // removeFormat leaves style spans in some browsers — unwrap them.
    const sel = window.getSelection();
    if (sel.rangeCount) {
      const range = sel.getRangeAt(0);
      root.current.querySelectorAll('span, font').forEach((el) => {
        if (range.intersectsNode(el)) el.replaceWith(...el.childNodes);
      });
    }
  };

  const keep = (e) => e.preventDefault(); // toolbar buttons must not steal focus from the text
  const btn = (name, title, onClick, active, content) => (
    <button type="button" className={`de-btn ${active ? 'on' : ''}`} title={title} aria-label={title} onMouseDown={keep}
      onClick={() => { onClick(); refreshState(); }}>
      {content || <Icon name={name} size={16} />}
    </button>
  );
  const lineIndex = () => {
    const line = currentLine();
    const lines = collectLines(root.current);
    if (!line) return Math.max(0, lines.length - 1);
    const text = htmlToText(sanitizeHtml(line.innerHTML));
    const before = [...root.current.children].slice(0, [...root.current.children].indexOf(line))
      .filter((l) => htmlToText(sanitizeHtml(l.innerHTML))).length;
    return text ? before : Math.max(0, before - 1);
  };

  return (
    <div ref={box} className={`day-editor list-${s.listStyle} ${compact ? 'compact' : ''}`} style={{ left: pos.left, top: pos.top }}
      role="dialog" aria-label={`${y}년 ${m}월 ${d}일 편집`}>
      <div className="de-head">
        <span className="de-date">{y}년 {m}월 {d}일</span>
        {dayBg && <span className="de-bg-dot" style={{ background: dayBg }} title="칸 배경색" />}
        <button type="button" className="de-ok" title="저장 (Enter)" aria-label="저장" onMouseDown={keep} onClick={() => save()}>
          <Icon name="check" size={16} stroke={2.4} />
        </button>
      </div>
      <div
        ref={root}
        className="de-body"
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        onKeyDown={onKeyDown}
        style={{ fontFamily: 'var(--edit-font)', fontSize: `${Math.round(s.editFontSize * 0.75)}pt` }}
      />
      <div className="de-hint">{compact ? 'Enter 줄바꿈 · ✓ 저장' : 'Enter 저장 · Ctrl+Enter 줄바꿈'}</div>
      <div className="de-tools">
        <div className="de-row">
          {btn('', '굵게 (Ctrl+B)', () => exec('bold'), state.bold, <b>B</b>)}
          {btn('', '기울임 (Ctrl+I)', () => exec('italic'), state.italic, <i>I</i>)}
          {btn('', '밑줄 (Ctrl+U)', () => exec('underline'), state.underline, <u>U</u>)}
          {btn('', '취소선', () => exec('strikeThrough'), state.strike, <s>ab</s>)}
          <span className="de-grow" />
          {btn('clock', '시간·반복·알림 등 상세 설정', () => save({ close: false, detailIndex: lineIndex() }))}
        </div>
        <div className="de-row">
          <div className="de-pop">
            {btn('', '글자색', () => setMenu(menu === 'color' ? null : 'color'), menu === 'color',
              <span className="de-a">A<span className="de-a-bar" style={{ background: state.color }} /></span>)}
            {menu === 'color' && <Palette title="글자색" colors={TEXT_COLORS} onPick={(c) => { exec('foreColor', c || '#000000'); setMenu(null); }} />}
          </div>
          <div className="de-pop">
            {btn('', '칸 배경색', () => setMenu(menu === 'bg' ? null : 'bg'), menu === 'bg',
              <span className="de-cell-icon"><span style={{ background: dayBg || 'transparent' }} /></span>)}
            {menu === 'bg' && <Palette title="칸 배경색" colors={CELL_COLORS} allowNone onPick={(c) => { onSetBg(c); setMenu(null); }} />}
          </div>
          <div className="de-pop">
            {btn('', '글꼴', () => setMenu(menu === 'font' ? null : 'font'), menu === 'font', <span className="de-ga">가</span>)}
            {menu === 'font' && (
              <div className="de-palette de-fonts" onMouseDown={keep}>
                {FONTS.map((f) => (
                  <button type="button" key={f.value} style={{ fontFamily: f.css }} onClick={() => { exec('fontName', f.css); setMenu(null); }}>{f.label}</button>
                ))}
              </div>
            )}
          </div>
          <div className="de-size" title="글자 크기 (pt)">
            <input type="number" min="6" max="48" value={state.size} onMouseDown={(e) => e.stopPropagation()}
              onChange={(e) => setState((st) => ({ ...st, size: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); root.current.focus(); setSize(state.size); } }} />
            <span className="de-spin">
              <button type="button" onMouseDown={keep} onClick={() => setSize(Number(state.size) + 1)} aria-label="크게">▲</button>
              <button type="button" onMouseDown={keep} onClick={() => setSize(Number(state.size) - 1)} aria-label="작게">▼</button>
            </span>
            <span className="de-pt">pt</span>
          </div>
          <span className="de-sep" />
          {btn('checkSquare', '완료 체크 (지금 줄)', toggleDone)}
          {btn('list', `목록 모양 바꾸기 (지금: ${{ bullet: '점', number: '번호', none: '없음' }[s.listStyle]})`, onCycleList)}
          {btn('clearFormat', '서식 지우기', clearFormat)}
        </div>
      </div>
    </div>
  );
}
