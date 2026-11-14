import { definePluginSettings } from "@api/Settings";
import definePlugin, { OptionType } from "@utils/types";
import { ChannelStore, Constants, FluxDispatcher, RestAPI, SelectedChannelStore, UserStore } from "@webpack/common";

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

const SELF_ACTIONS = new Set(["CONNECTION_OPEN", "CURRENT_USER_UPDATE", "UPDATE_CLIENT_PREMIUM_TYPE", "USER_RESTRICTED_SCHEDULE_UPDATE"]);
const SELF_FIELDS = [["avatar", "avatar"], ["banner", "banner"], ["global_name", "globalName"], ["username", "username"]] as const;
const REFRESH_GAP = 10_000;
let refreshedAt = 0;

function refreshSelf() {
    if (Date.now() - refreshedAt < REFRESH_GAP) return;
    refreshedAt = Date.now();
    RestAPI.get({ url: Constants.Endpoints.ME }).then(
        ({ body }) => FluxDispatcher.dispatch({ type: "CURRENT_USER_UPDATE", user: body }),
        () => { }
    );
}
const PROFILE_FIELDS = ["accent_color", "banner", "bio", "pronouns", "popout_animation_particle_type", "theme_colors", "collectibles"];
const SAVED_FOR = 120_000;
let savedProfile: { at: number; fields: Record<string, unknown>; } | undefined;

function keepSavedProfile(action: any) {
    const self = UserStore.getCurrentUser()?.id;
    if (action.type === "USER_PROFILE_UPDATE_SUCCESS" && action.userId === self && action.guild_id == null) {
        savedProfile = { at: Date.now(), fields: Object.fromEntries(PROFILE_FIELDS.filter(key => key in action).map(key => [key, action[key]])) };
    } else if (action.type === "USER_PROFILE_FETCH_SUCCESS" && savedProfile && action.userProfile?.user?.id === self && action.userProfile.user_profile) {
        if (Date.now() - savedProfile.at > SAVED_FOR) savedProfile = undefined;
        else Object.assign(action.userProfile.user_profile, savedProfile.fields);
    }
    return false;
}

const DEBUG = /\.highlight-mana-/;
const ZERO = /^0(px)?$/;
const FOLDER_STRIP = /\.folderButtonContent_[\w-]+$/;
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

function setRestorable(style: CSSStyleDeclaration, property: string, value: string | null) {
    const before = style.getPropertyValue(property);
    const priority = style.getPropertyPriority(property);
    if (value === null) style.removeProperty(property);
    else style.setProperty(property, value, priority);
    if (style.getPropertyValue(property) === before) return;
    changes.push({ restore: () => before ? style.setProperty(property, before, priority) : style.removeProperty(property) });
}

function transformFunctions(value: string) {
    const parts: string[] = [];
    let depth = 0, start = 0;
    for (let i = 0; i < value.length; i++) {
        if (value[i] === "(") depth++;
        else if (value[i] === ")" && --depth === 0) {
            parts.push(value.slice(start, i + 1).trim());
            start = i + 1;
        }
    }
    return value.slice(start).trim() ? null : parts;
}

function parseFunction(fn: string) {
    const open = fn.indexOf("(");
    return { name: fn.slice(0, open).trim(), args: splitSelectors(fn.slice(open + 1, -1)) };
}

function flatten(rule: CSSStyleRule) {
    const { style } = rule;
    const transform = style.transform;
    if (!transform || !/translateZ|translate3d/.test(transform) || REAL_3D.test(style.cssText)) return;
    const fns = transformFunctions(transform);
    if (!fns) return;
    let changed = false;
    const flat = fns.map(fn => {
        const { name, args } = parseFunction(fn);
        if (name === "translateZ" && args.length === 1 && ZERO.test(args[0])) {
            changed = true;
            return "translate(0px)";
        }
        if (name === "translate3d" && args.length === 3 && ZERO.test(args[2])) {
            changed = true;
            return `translate(${args[0]}, ${args[1]})`;
        }
        return fn;
    });
    if (changed) setRestorable(style, "transform", flat.join(" "));
}

function verticalOffset(transform: string) {
    const fns = transformFunctions(transform);
    if (fns?.length !== 1) return null;
    const { name, args } = parseFunction(fns[0]);
    if (name === "translateZ") return args.length === 1 && ZERO.test(args[0]) ? "0px" : null;
    if (name === "translateY") return args.length === 1 ? args[0] : null;
    if (!ZERO.test(args[0])) return null;
    if (name === "translate" && args.length <= 2) return args[1] ?? "0px";
    if (name === "translate3d" && args.length === 3 && ZERO.test(args[2])) return args[1];
    return null;
}

function moveFolderStrip(rule: CSSStyleRule) {
    if (!splitSelectors(rule.selectorText).every(s => FOLDER_STRIP.test(s))) return false;
    const { style } = rule;
    const { transform } = style;
    if (transform) {
        const offset = verticalOffset(transform);
        if (offset === null) return false;
        setRestorable(style, "top", offset);
        setRestorable(style, "transform", null);
    }
    for (const property of ["transition", "transition-property"]) {
        const value = style.getPropertyValue(property);
        if (/\btransform\b/.test(value)) setRestorable(style, property, value.replace(/\btransform\b/g, "top"));
    }
    return true;
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
            if (!stripDebug(parent, i, rule) && !moveFolderStrip(rule)) flatten(rule);
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
    description: "Makes Discord cheaper to draw without changing how it looks: removes design-debug styles it ships to everyone, drops GPU-layer tricks from its CSS, stops hidden chat separators from getting layers of their own, and makes menus open faster: they no longer restyle the whole app, and emoji menus no longer rebuild Discord's emoji list. Also stops your avatar and banner from flicking back to the old ones after you change them.",
    authors: [{ name: "aquaryuo", id: 975151124824879125n }],
    enabledByDefault: true,
    managedStyle,
    settings,

    patches: [
        {
            find: "getDisambiguatedEmojiContext().getById(",
            replacement: [
                {
                    match: /getDisambiguatedEmojiContext\(\)(?=\.getById\()/,
                    replace: "getDisambiguatedEmojiContext($self.emojiGuild())"
                },
                {
                    match: /\(0,(\i\.\i)\)\(null,(\i)\)(?=;return)/,
                    replace: "(0,$1)($self.emojiGuild(),$2)"
                }
            ]
        },
        {
            find: 'displayName="UserStore"',
            replacement: [
                {
                    match: /function \i\((\i)\){(?=let \i,\i=!\(arguments\.length>1\)\|\|void 0===arguments\[1\]\|\|arguments\[1\],\i=\i\[\1\.id\])/,
                    replace: "$&if($self.foreignSelf($1))return!1;"
                },
                {
                    match: /(let (\i)=\i\[(\i)\.user\.id\];if\(null==\2)\)return!1;/,
                    replace: "$1||$self.foreignSelf($3.user))return!1;"
                }
            ]
        }
    ],

    emojiGuild() {
        return ChannelStore.getChannel(SelectedChannelStore.getChannelId())?.getGuildId() ?? null;
    },

    foreignSelf(user?: Record<string, any>) {
        const me: Record<string, any> | undefined = UserStore.getCurrentUser();
        if (user?.id == null || user.id !== me?.id || SELF_ACTIONS.has((FluxDispatcher as any)._currentDispatchActionType)) return false;
        if (SELF_FIELDS.some(([wire, local]) => wire in user && (user[wire] ?? null) !== (me[local] ?? null))) refreshSelf();
        return true;
    },

    start() {
        FluxDispatcher.addInterceptor(keepSavedProfile);
        for (const sheet of document.styleSheets) clean(sheet);
        observer = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(cleanNode)));
        observer.observe(document.head, { childList: true });
        if (!watchLayers()) findTimer = setInterval(() => watchLayers() && clearInterval(findTimer), 1000);
        updateBackdrop();
    },

    stop() {
        const interceptors: unknown[] = FluxDispatcher._interceptors;
        if (interceptors.includes(keepSavedProfile)) interceptors.splice(interceptors.indexOf(keepSavedProfile), 1);
        savedProfile = undefined;
        refreshedAt = 0;
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
