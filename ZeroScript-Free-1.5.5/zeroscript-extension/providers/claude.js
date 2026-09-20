// SPDX-License-Identifier: GPL-3.0-or-later
// providers/claude.js - Claude (claude.ai) provider.
// Claude's UI changes frequently, so selectors intentionally prefer stable
// accessibility/data attributes and keep conservative fallbacks.
/* eslint-disable no-unused-vars */
const ZSProvider = (() => {
  "use strict";
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let diag = () => {};

  const S = {
    editor: 'textarea, [contenteditable="true"]',
    user: '[data-testid*="user"], [data-is-user="true"], [data-role="user"]',
    assistant: '[data-testid*="assistant"], [data-is-assistant="true"], [data-role="assistant"], .font-claude-message',
    stop: 'button[aria-label*="Stop" i], button[aria-label*="arrêter" i], button[data-testid*="stop" i]',
    send: 'button[aria-label*="Send" i], button[aria-label*="Envoyer" i], button[data-testid*="send" i]',
    continue: 'button',
  };
  const RE = {
    context: /conversation.{0,30}(too long|limit|length)|context.{0,20}(limit|exceeded)|message.{0,20}too long/i,
    busy: /something went wrong|try again later|temporarily unavailable|rate limit/i,
    cont: /^(continue|continuer|continue generating)$/i,
  };
  const timings = {
    GEN_IDLE_MS: 1800,
    REASON_IDLE_MS: 12000,
    WARMUP_MS: 45000,
    REASON_NOREPLY_MS: 90000,
    STABLE_MS: 8000,
    RESPONSE_TIMEOUT_MS: 300000,
  };

  const visible = (e) => !!e && e.offsetParent !== null;
  const editor = () => [...document.querySelectorAll(S.editor)].find((e) => !e.closest("#zs-root")) || null;
  const editorText = () => {
    const e = editor();
    return e ? (e.value != null ? e.value : e.textContent || "") : "";
  };
  const isUser = (e) => !!e && (e.matches(S.user) || /user|human/i.test(e.getAttribute("data-role") || ""));
  const isAssistant = (e) => !!e && !isUser(e);
  const allItems = () => {
    const found = [...document.querySelectorAll(`${S.user}, ${S.assistant}`)].filter((e) => !e.closest("#zs-root"));
    return [...new Set(found)];
  };
  const assistantItems = () => allItems().filter(isAssistant);
  const lastAssistant = () => { const a = assistantItems(); return a[a.length - 1] || null; };
  const itemText = (e) => e ? [...e.querySelectorAll("p, pre, code, [class*='prose'], [class*='message']")].map((n) => n.textContent || "").join("\n").trim() || (e.textContent || "").trim() : "";
  const classifyText = (e, exclude) => {
    if (!e) return "";
    const clone = e.cloneNode(true);
    if (exclude) clone.querySelectorAll(exclude).forEach((n) => n.remove());
    return itemText(clone);
  };
  const key = (e) => e && (e.getAttribute("data-message-id") || e.getAttribute("data-testid") || null);
  const lastAssistantId = () => key(lastAssistant());
  const itemKey = key;
  const chatIsEmpty = () => allItems().length === 0;
  const isFreshChat = () => chatIsEmpty() && !!editor();
  const composerFrame = () => editor()?.closest("form") || editor()?.parentElement || null;
  const barMount = () => null;
  const setInputLock = (on) => { const e = editor(); if (e) e.setAttribute("contenteditable", on ? "false" : "true"); };

  const stopButton = () => [...document.querySelectorAll(S.stop)].find(visible) || null;
  const sendButton = () => [...document.querySelectorAll(S.send)].find(visible) || null;
  const streamLen = (e) => itemText(e || lastAssistant()).length;
  let max = -1, lastGrowth = 0, streamItem = null;
  function sample() {
    const e = lastAssistant(), n = streamLen(e), now = Date.now();
    if (e !== streamItem || n < max - 400) { streamItem = e; max = n; lastGrowth = now; }
    else if (n > max) { max = n; lastGrowth = now; }
  }
  const isGenerating = () => { sample(); return !!stopButton() || (max > 1 && Date.now() - lastGrowth < timings.GEN_IDLE_MS); };
  const isBusyNow = isGenerating;
  const isHardGenerating = () => !!stopButton();
  const waitFor = async (pred, timeout) => { const t = Date.now(); while (Date.now() - t < timeout) { if (pred()) return true; await sleep(120); } return false; };

  function setEditorText(e, text) {
    e.focus();
    if (e.value != null) {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(e), "value");
      if (setter?.set) setter.set.call(e, text); else e.value = text;
      e.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      const range = document.createRange(); range.selectNodeContents(e);
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
      document.execCommand("insertText", false, text);
      e.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    }
  }
  async function typeAndSend(text) {
    const e = editor();
    if (!e) throw new Error("Claude input box not found");
    setEditorText(e, text);
    await waitFor(() => !!sendButton() || editorText().trim() === text.trim(), 1500);
    const b = sendButton();
    if (b) { b.click(); return; }
    e.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
  }
  function stopGeneration() { const b = stopButton(); if (b) try { b.click(); } catch {} }
  function readAssistant() { const item = lastAssistant(); return { present: !!item, reply: itemText(item), thinking: "", item }; }
  function snapshot() { return { th: 0, rp: streamLen() }; }
  function findContinueBtn() { return [...document.querySelectorAll(S.continue)].find((b) => visible(b) && RE.cont.test((b.innerText || "").trim())) || null; }
  function clickContinueBtn() { const b = findContinueBtn(); if (!b) return false; try { b.click(); return true; } catch { return false; } }
  function scanError() {
    for (const e of document.querySelectorAll('[role="alert"], [class*="error"], [class*="toast"]')) {
      if (visible(e) && !e.closest("[data-testid*='message']")) { const t = (e.innerText || "").trim(); if (t.length > 8 && t.length < 600 && RE.context.test(t)) return t.slice(0, 240); }
    }
    if (!editor()) return "The Claude input box disappeared (session ended?).";
    return null;
  }
  const isTooLongMsg = (t) => RE.context.test(t || "");
  const isBusyMsg = (t) => RE.busy.test(t || "");
  const conversationKey = () => location.pathname || "";
  function installSendHooks(h) {
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || e.shiftKey || e.isComposing || !editor()?.contains(e.target) || !editorText().trim() || h.isBlocked()) return;
      if (!h.isStarted()) { if (chatIsEmpty()) h.onBlockedAttempt(); return; }
      h.onUserMessage(assistantItems().length);
    }, true);
    document.addEventListener("click", (e) => {
      if (!editor()) return;
      if (e.target?.closest?.(S.stop)) { h.onNativeStop(); return; }
      if (e.target?.closest?.(S.send) && !h.isBlocked() && h.isStarted()) h.onUserMessage(assistantItems().length);
    }, true);
  }
  function findToolBlockSpot(item, chip) {
    for (const n of item.querySelectorAll("pre, code, p, div")) {
      if (n === chip || n.closest(".zs-chip")) continue;
      if (/\"(?:command|tool)\"\s*:|###\s*(?:LUA|MCP_TOOL)\s*###/i.test(n.textContent || "")) { n.classList.add("zs-tool-hide"); return { parent: n.parentElement, ref: n }; }
    }
    return null;
  }
  return {
    id: "claude", displayName: "Claude", timings, supportsVision: false,
    init({ diag: d } = {}) { if (d) diag = d; },
    allItems, isUserItem: isUser, isAssistantItem: isAssistant, itemText, classifyText,
    assistantCount: () => assistantItems().length, userCount: () => allItems().filter(isUser).length,
    lastAssistant, lastAssistantId, itemKey, readAssistant, streamLen, snapshot,
    getEditor: editor, editorText, chatIsEmpty, isFreshChat, composerFrame, barMount,
    setInputLock, typeAndSend, stopGeneration, isGenerating, isBusyNow, isHardGenerating,
    enforceComposer() { return { ready: !!editor() }; },
    async ensureComposerReady(reason) { diag("mode_ready", { reason, provider: "claude" }); return { ready: !!editor() }; },
    turnHalted: () => false, findContinueBtn, clickContinueBtn, scanError, isTooLongMsg, isBusyMsg,
    attachImages: async () => false, clearAttachments() {}, conversationKey, installSendHooks, findToolBlockSpot,
  };
})();
