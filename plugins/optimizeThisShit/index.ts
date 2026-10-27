import definePlugin from "@utils/types";

import managedStyle from "./styles.css?managed";

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

    start() {
        for (const sheet of document.styleSheets) clean(sheet);
        observer = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(cleanNode)));
        observer.observe(document.head, { childList: true });
    },

    stop() {
        observer?.disconnect();
        observer = undefined;
        for (const change of changes.splice(0).reverse()) {
            try {
                change.restore();
            } catch { }
        }
    }
});
