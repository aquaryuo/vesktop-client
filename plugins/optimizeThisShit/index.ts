import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";

import managedStyle from "./styles.css?managed";

const settings = definePluginSettings({
    plainBackdrop: {
        type: OptionType.BOOLEAN,
        description: "Stop drawing the app behind Settings, the image viewer and other dimmed windows. Scrolling them gets smoother, but the dimmed app around the window turns into a plain dark backdrop",
        default: false,
        onChange: () => updateBackdrop()
    }
});

const PANEL = '[class*="notAppAsidePanel_"]';
const CONTAINER = `${PANEL} > [class*="layerContainer_"]`;
const COVERED = "data-vc-ots-covered";
const watched = new WeakSet<Element>();
let layerObserver: MutationObserver | undefined;
let findTimer: ReturnType<typeof setInterval> | undefined;

function updateBackdrop() {
    const cover = settings.store.plainBackdrop && !!document.querySelector(`${CONTAINER} [class*="scrim_"]`);
    const base = document.querySelector('[class*="baseLayer_"]');
    document.querySelectorAll(`[${COVERED}]`).forEach(el => el !== base && el.removeAttribute(COVERED));
    base?.toggleAttribute(COVERED, cover);
}

function watchLayers() {
    const panels = document.querySelectorAll(PANEL);
    if (!panels.length) return false;
    layerObserver ??= new MutationObserver(records => {
        if (records.some(r => (r.target as Element).matches?.(PANEL))) watchLayers();
        updateBackdrop();
    });
    for (const panel of panels) {
        if (!watched.has(panel)) {
            watched.add(panel);
            layerObserver.observe(panel, { childList: true });
        }
        for (const container of panel.querySelectorAll(':scope > [class*="layerContainer_"]')) {
            if (watched.has(container)) continue;
            watched.add(container);
            layerObserver.observe(container, { childList: true, subtree: true });
        }
    }
    return true;
}

const DEBUG = /\.highlight-mana-/;
const FLAT_3D = /translateZ\(\s*0(px)?\s*\)|translate3d\(\s*[^,()]+,\s*[^,()]+,\s*0(px)?\s*\)/;
const REAL_3D = /perspective|preserve-3d|backface/;

type RuleParent = CSSStyleSheet | CSSGroupingRule;

interface Change {
    restore(): void;
}

const changes: Change[] = [];
let observer: MutationObserver | undefined;

function splitSelectors(text: string) {
    const parts: string[] = [];
    let depth = 0, start = 0;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === "(" || c === "[") depth++;
        else if (c === ")" || c === "]") depth--;
        else if (c === "," && depth === 0) {
            parts.push(text.slice(start, i).trim());
            start = i + 1;
        }
    }
    parts.push(text.slice(start).trim());
    return parts;
}

function removeAt(parent: RuleParent, index: number) {
    const text = parent.cssRules[index].cssText;
    parent.deleteRule(index);
    changes.push({ restore: () => parent.insertRule(text, Math.min(index, parent.cssRules.length)) });
}

function stripDebug(parent: RuleParent, index: number, rule: CSSStyleRule) {
    const selectors = splitSelectors(rule.selectorText);
    const kept = selectors.filter(s => !DEBUG.test(s));
    if (kept.length === selectors.length) return false;
    if (!kept.length) {
        removeAt(parent, index);
        return true;
    }
    const original = rule.selectorText;
    rule.selectorText = kept.join(", ");
    changes.push({ restore: () => { rule.selectorText = original; } });
    return false;
}

function flatten(rule: CSSStyleRule) {
    const { style } = rule;
    const transform = style.transform;
    if (!transform || !FLAT_3D.test(transform) || REAL_3D.test(style.cssText)) return;
    const flat = transform
        .replace(/translateZ\(\s*0(px)?\s*\)/g, "translate(0px)")
        .replace(/translate3d\(\s*([^,()]+),\s*([^,()]+),\s*0(px)?\s*\)/g, "translate($1, $2)");
    const priority = style.getPropertyPriority("transform");
    style.setProperty("transform", flat, priority);
    if (style.transform === transform) return;
    changes.push({ restore: () => style.setProperty("transform", transform, priority) });
}

function clean(parent: RuleParent) {
    let rules: CSSRuleList;
    try {
        rules = parent.cssRules;
    } catch {
        return;
    }
    for (let i = rules.length - 1; i >= 0; i--) {
        const rule = rules[i];
        if (rule instanceof CSSStyleRule) {
            if (!stripDebug(parent, i, rule)) flatten(rule);
        } else if (typeof CSSScopeRule !== "undefined" && rule instanceof CSSScopeRule && DEBUG.test(rule.start ?? "")) {
            removeAt(parent, i);
        } else if (rule instanceof CSSGroupingRule) {
            clean(rule);
        }
    }
}

function cleanNode(node: Node) {
    if (node instanceof HTMLLinkElement && node.rel === "stylesheet") {
        if (node.sheet) clean(node.sheet);
        else node.addEventListener("load", () => node.sheet && clean(node.sheet), { once: true });
    } else if (node instanceof HTMLStyleElement && node.sheet) {
        clean(node.sheet);
    }
}

export default definePlugin({
    name: "Optimize This S**t",
    description: "Makes Discord cheaper to draw without changing how it looks: removes design-debug styles it ships to everyone, drops GPU-layer tricks from its CSS, and stops hidden chat separators from getting layers of their own.",
    authors: [{ name: "aquaryuo", id: 975151124824879125n }],
    enabledByDefault: true,
    managedStyle,
    settings,

    start() {
        for (const sheet of document.styleSheets) clean(sheet);
        observer = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(cleanNode)));
        observer.observe(document.head, { childList: true });
        if (!watchLayers()) findTimer = setInterval(() => watchLayers() && clearInterval(findTimer), 1000);
        updateBackdrop();
    },

    stop() {
        observer?.disconnect();
        observer = undefined;
        clearInterval(findTimer);
        layerObserver?.disconnect();
        layerObserver = undefined;
        document.querySelectorAll(`[${COVERED}]`).forEach(el => el.removeAttribute(COVERED));
        for (const change of changes.splice(0).reverse()) {
            try {
                change.restore();
            } catch { }
        }
    }
});
