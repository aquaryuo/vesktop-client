import definePlugin from "@utils/types";

const DEBUG = /\.highlight-mana-/;

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
            const selectors = splitSelectors(rule.selectorText);
            const kept = selectors.filter(s => !DEBUG.test(s));
            if (kept.length === selectors.length) continue;
            if (!kept.length) {
                removeAt(parent, i);
                continue;
            }
            const original = rule.selectorText;
            rule.selectorText = kept.join(", ");
            changes.push({ restore: () => { rule.selectorText = original; } });
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
    description: "Removes the design-debug styles Discord ships to every user. They never show, but they make the whole app recompute its styles on every change, which causes lag. Nothing visible changes.",
    authors: [{ name: "aquaryuo", id: 975151124824879125n }],
    enabledByDefault: true,

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
