import test from 'node:test';
import assert from 'node:assert/strict';
import { htmlToText, sanitizeHtml } from './sanitize.js';

test('keeps whitelisted formatting', () => {
  const html = '<b>출장</b> <span style="color: rgb(255, 0, 0); font-size: 14pt">청</span><i>x</i><u>u</u><strike>s</strike>';
  assert.equal(sanitizeHtml(html), html.replace('color: rgb(255, 0, 0); font-size: 14pt', 'color: rgb(255, 0, 0); font-size: 14pt'));
});

test('drops scripts, handlers and unknown tags', () => {
  assert.equal(sanitizeHtml('<img src=x onerror=alert(1)>hi'), 'hi');
  assert.equal(sanitizeHtml('<script>alert(1)</script>ok'), 'alert(1)ok');
  assert.equal(sanitizeHtml('<b onclick="x()">b</b>'), '<b>b</b>');
  assert.equal(sanitizeHtml('<span style="background: url(javascript:x); color: red">a</span>'), '<span style="color: red">a</span>');
  assert.equal(sanitizeHtml('<a href="javascript:x">a</a>'), 'a');
  assert.equal(sanitizeHtml('1 < 2 and <b'), '1 &lt; 2 and &lt;b');
});

test('font tags keep only color and face', () => {
  assert.equal(sanitizeHtml('<font color="#ff0000" face="Gulim" size="7">a</font>'), '<font color="#ff0000" face="Gulim">a</font>');
});

test('plain text extraction', () => {
  assert.equal(htmlToText('<b>A</b> &amp; <span>B</span>&nbsp;'), 'A & B');
});

test('Korean font names survive', () => {
  assert.equal(sanitizeHtml(`<span style="font-family: Dotum, '돋움', sans-serif">a</span>`), `<span style="font-family: Dotum, '돋움', sans-serif">a</span>`);
});

import { stripStyles } from './sanitize.js';
test('stripStyles removes only the requested properties', () => {
  const html = '<span style="font-family: Gulim; font-size: 14pt; color: red; font-weight: bold">a</span><font color="#f00" face="Batang">b</font>';
  assert.equal(stripStyles(html, ['color']), '<span style="font-family: Gulim; font-size: 14pt; font-weight: bold">a</span><font face="Batang">b</font>');
  assert.equal(stripStyles(html, ['font-family', 'font-size']), '<span style="color: red; font-weight: bold">a</span><font color="#f00">b</font>');
  assert.equal(stripStyles('<span style="color: red">x</span>', ['color']), '<span>x</span>');
});
