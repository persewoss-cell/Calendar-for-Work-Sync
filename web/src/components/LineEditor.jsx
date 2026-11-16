import { useEffect, useRef, useState } from 'react';

/**
 * Edit a list of lines in place (one line = one task), like typing in the original cell.
 * Enter adds a line, Backspace on an empty line removes it, Esc / blur commits.
 */
export function LineEditor({ lines, onCommit, onCancel, style, placeholder = '할 일을 입력하세요', autoFocusIndex }) {
  // Always start with an empty line at the end so clicking a cell means "add a task".
  const [rows, setRows] = useState(() => [...lines, { key: 'new-0', text: '' }]);
  const refs = useRef([]);
  const focusTo = useRef(autoFocusIndex ?? rows.length - 1);
  const root = useRef(null);
  const committed = useRef(false);

  useEffect(() => {
    if (focusTo.current != null) {
      const el = refs.current[focusTo.current];
      if (el) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
      focusTo.current = null;
    }
  });

  const commit = () => {
    if (committed.current) return;
    committed.current = true;
    onCommit(rows);
  };

  const update = (i, text) => setRows((r) => r.map((row, j) => (j === i ? { ...row, text } : row)));

  const onKeyDown = (e, i) => {
    if (e.nativeEvent.isComposing) return; // Korean IME composition in progress
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) return commit();
      setRows((r) => [...r.slice(0, i + 1), { key: `new-${Date.now()}`, text: '' }, ...r.slice(i + 1)]);
      focusTo.current = i + 1;
    } else if (e.key === 'Backspace' && rows[i].text === '' && rows.length > 1) {
      e.preventDefault();
      setRows((r) => r.filter((_, j) => j !== i));
      focusTo.current = Math.max(0, i - 1);
    } else if (e.key === 'ArrowUp' && i > 0) {
      e.preventDefault();
      refs.current[i - 1]?.focus();
    } else if (e.key === 'ArrowDown' && i < rows.length - 1) {
      e.preventDefault();
      refs.current[i + 1]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      commit();
    } else if (e.key.toLowerCase() === 'e' && e.ctrlKey && e.altKey) {
      e.preventDefault();
      commit();
    }
  };

  const onBlur = () => {
    setTimeout(() => {
      if (root.current && !root.current.contains(document.activeElement)) commit();
    }, 0);
  };

  return (
    <div className="line-editor" ref={root} style={style} onClick={(e) => e.stopPropagation()}>
      {rows.map((row, i) => (
        <input
          key={row.key}
          ref={(el) => (refs.current[i] = el)}
          value={row.text}
          placeholder={i === 0 ? placeholder : ''}
          onChange={(e) => update(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(e, i)}
          onBlur={onBlur}
        />
      ))}
      <div className="line-editor-hint">
        Enter 새 줄 · Esc 저장
        {onCancel && <button type="button" onMouseDown={(e) => { e.preventDefault(); committed.current = true; onCancel(); }}>취소</button>}
      </div>
    </div>
  );
}
