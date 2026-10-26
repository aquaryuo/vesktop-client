import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { classes } from "@utils/misc";
import definePlugin, { OptionType } from "@utils/types";
import { chooseFile, saveFile } from "@utils/web";
import { EmojiStore, FluxDispatcher, React, UserSettingsActionCreators, UserStore, useEffect, useLayoutEffect, useRef, useState } from "@webpack/common";
import type { ImgHTMLAttributes, MouseEvent as ReactMouseEvent, SyntheticEvent } from "react";

import managedStyle from "./styles.css?managed";

const MIN_HEIGHT = 280;
const BASE_WIDTH = 498;
const MAX_ZOOM = 2;
const COLUMNS = [0, 2, 3, 4, 5, 6, 7, 8];
const CHECK_TIMEOUT = 15000;
const CHECK_WORKERS = 6;
const COG = "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2zM9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0";
const MAX_EMOJIS = 250;
const MAX_GIF_BYTES = 762880;
const FONT_URL = "https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@600&display=swap";
const ID = /^\d{17,20}$/;
const NAME = /^[\w+-]{1,64}$/;

interface Gif {
    format: number;
    src: string;
    width: number;
    height: number;
    order: number;
}

interface Emoji {
    id?: string;
    name?: string;
    animated?: boolean;
}

interface Favorites {
    emojis: Emoji[];
    gifs: Record<string, Gif>;
}

const settings = definePluginSettings({
    columns: {
        type: OptionType.SELECT,
        description: "GIFs per row",
        options: [
            { label: "Fit to width", value: 0, default: true },
            ...[2, 3, 4, 5, 6, 7, 8].map(n => ({ label: String(n), value: n }))
        ]
    },
    hoverPlay: {
        type: OptionType.BOOLEAN,
        description: "Play GIFs in the picker only while you hover them",
        default: true
    },
    scale: {
        type: OptionType.BOOLEAN,
        description: "Size stickers and emojis to the picker's width",
        default: true
    },
    height: {
        type: OptionType.NUMBER,
        description: "Picker height in pixels, 0 for Discord's. Drag the picker's top edge to set it, or double-click the edge to reset it",
        default: 0
    },
    transfer: {
        type: OptionType.COMPONENT,
        component: () => <Transfer />
    }
});

const frecency = () => UserSettingsActionCreators.FrecencyUserSettingsActionCreators;

function protoField(name: string) {
    const field = frecency().ProtoClass?.fields?.find((f: any) => f.localName === name);
    const getter = field && Object.values(field).find(v => typeof v === "function") as (() => any) | undefined;
    return getter?.();
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function isHttps(value: unknown): value is string {
    if (typeof value !== "string" || value.length > 2048) return false;
    try {
        return new URL(value).protocol === "https:";
    } catch {
        return false;
    }
}

async function exportFavorites() {
    await frecency().loadIfNecessary?.();
    const { favoriteEmojis, favoriteGifs } = frecency().getCurrentValue();
    const emojis: Emoji[] = (favoriteEmojis?.emojis ?? []).map((key: string) => {
        const emoji = EmojiStore.getCustomEmojiById(key);
        if (emoji) return { id: emoji.id, name: emoji.name, animated: emoji.animated };
        return ID.test(key) ? { id: key } : { name: key };
    });
    const gifs: Record<string, Gif> = {};
    for (const [url, { format, src, width, height, order }] of Object.entries<Gif>(favoriteGifs?.gifs ?? {}))
        gifs[url] = { format, src, width, height, order };

    const date = new Date().toISOString().slice(0, 10);
    const file = new File([JSON.stringify({ emojis, gifs }, null, 2)], `favorites-${UserStore.getCurrentUser().username}-${date}.json`, { type: "application/json" });
    saveFile(file);
    return `Exported ${plural(emojis.length, "emoji")} and ${plural(Object.keys(gifs).length, "GIF")}.`;
}

function parseFavorites(text: string): Favorites {
    const raw = JSON.parse(text);
    const emojis: Emoji[] = (Array.isArray(raw?.emojis) ? raw.emojis : [])
        .filter((e: any) => typeof e?.id === "string" ? ID.test(e.id) : typeof e?.name === "string" && NAME.test(e.name))
        .map((e: any) => typeof e.id === "string" ? { id: e.id } : { name: e.name });

    const gifs: Record<string, Gif> = {};
    if (raw?.gifs && typeof raw.gifs === "object")
        for (const [url, gif] of Object.entries<any>(raw.gifs)) {
            const size = (n: unknown) => Number.isInteger(n) && (n as number) > 0 && (n as number) < 100000;
            if (isHttps(url) && (gif?.format === 1 || gif?.format === 2) && isHttps(gif.src) && size(gif.width) && size(gif.height))
                gifs[url] = { format: gif.format, src: gif.src, width: gif.width, height: gif.height, order: Number.isInteger(gif.order) && gif.order >= 0 ? gif.order : 0 };
        }

    if (!emojis.length && !Object.keys(gifs).length) throw new Error("empty");
    return { emojis, gifs };
}

async function importEmojis(list: Emoji[]) {
    const result = { added: 0, already: 0, missing: 0, full: 0 };
    if (!list.length) return result;
    await frecency().updateAsync("favoriteEmojis", (data: { emojis: string[]; }) => {
        const have = new Set(data.emojis);
        for (const { id, name } of list) {
            const key = id ?? name!;
            if (have.has(key)) result.already++;
            else if (id && !EmojiStore.getCustomEmojiById(id)) result.missing++;
            else if (have.size >= MAX_EMOJIS) result.full++;
            else {
                have.add(key);
                data.emojis.push(key);
                result.added++;
            }
        }
        if (!result.added) return false;
    }, 0);
    return result;
}

async function importGifs(list: Record<string, Gif>) {
    const result = { added: 0, already: 0, full: 0 };
    if (!Object.keys(list).length) return result;
    const proto = protoField("favoriteGifs");
    if (!proto) throw new Error("no proto");
    await frecency().updateAsync("favoriteGifs", (data: { gifs: Record<string, Gif>; }) => {
        let order = Object.values(data.gifs).reduce((max, gif) => Math.max(max, gif.order), 0);
        const srcs = new Set(Object.values(data.gifs).map(gif => gif.src));
        const fresh: [string, Gif][] = [];
        for (const [url, gif] of Object.entries(list).sort(([, a], [, b]) => a.order - b.order)) {
            if (data.gifs[url] || srcs.has(gif.src)) {
                result.already++;
                continue;
            }
            srcs.add(gif.src);
            fresh.push([url, { ...gif, order: ++order }]);
        }
        const fits = (n: number) => proto.toBinary({ ...data, gifs: { ...data.gifs, ...Object.fromEntries(fresh.slice(0, n)) } }).length <= MAX_GIF_BYTES;
        let low = 0, high = fresh.length;
        while (low < high) {
            const mid = Math.ceil((low + high) / 2);
            if (fits(mid)) low = mid;
            else high = mid - 1;
        }
        for (const [url, gif] of fresh.slice(0, low)) data.gifs[url] = gif;
        result.added = low;
        result.full = fresh.length - low;
        if (!low) return false;
    }, 0);
    return result;
}

function loads(gif: Gif) {
    return new Promise<boolean | undefined>(resolve => {
        const el = gif.format === 2 ? document.createElement("video") : new Image();
        const timer = setTimeout(() => done(undefined), CHECK_TIMEOUT);
        function done(ok: boolean | undefined) {
            clearTimeout(timer);
            el.onload = el.onerror = null;
            el.removeAttribute("src");
            if (el instanceof HTMLVideoElement) {
                el.onloadedmetadata = null;
                el.load();
            }
            resolve(ok);
        }
        el.onerror = () => done(false);
        if (el instanceof HTMLVideoElement) {
            el.preload = "metadata";
            el.muted = true;
            el.onloadedmetadata = () => done(true);
        } else el.onload = () => done(true);
        el.src = gif.src;
    });
}

async function findBroken(onProgress: (done: number, total: number) => void) {
    await frecency().loadIfNecessary?.();
    const gifs = Object.entries<Gif>(frecency().getCurrentValue().favoriteGifs?.gifs ?? {});
    const broken: string[] = [];
    let next = 0, done = 0;
    onProgress(0, gifs.length);
    const worker = async () => {
        while (next < gifs.length) {
            const [url, gif] = gifs[next++];
            if (await loads(gif) === false) broken.push(url);
            onProgress(++done, gifs.length);
        }
    };
    await Promise.all(Array.from({ length: CHECK_WORKERS }, worker));
    return { broken, total: gifs.length };
}

async function removeGifs(urls: string[]) {
    await frecency().updateAsync("favoriteGifs", (data: { gifs: Record<string, Gif>; }) => {
        for (const url of urls) delete data.gifs[url];
    }, 0);
}

async function importFavorites() {
    const file = await chooseFile("application/json");
    if (!file) return "";
    let favorites: Favorites;
    try {
        favorites = parseFavorites(await file.text());
    } catch {
        return "That file isn't a favorites export.";
    }
    const emojis = await importEmojis(favorites.emojis);
    const gifs = await importGifs(favorites.gifs);
    const lines = [`Added ${plural(emojis.added, "emoji")} and ${plural(gifs.added, "GIF")}.`];
    if (emojis.missing) lines.push(`${plural(emojis.missing, "emoji")} ${emojis.missing === 1 ? "is" : "are"} from servers this account isn't in, so Discord can't show ${emojis.missing === 1 ? "it" : "them"}.`);
    if (emojis.full) lines.push(`No room for ${plural(emojis.full, "emoji")}: favorites hold ${MAX_EMOJIS}.`);
    if (gifs.full) lines.push(`No room for ${plural(gifs.full, "GIF")}: Discord's favorites are full.`);
    const already = emojis.already + gifs.already;
    if (already) lines.push(`${plural(already, "favorite")} ${already === 1 ? "was" : "were"} already there.`);
    return lines.join(" ");
}

function Transfer() {
    const [status, setStatus] = useState("");
    const [broken, setBroken] = useState<string[]>([]);
    const [checking, setChecking] = useState(false);

    async function check() {
        setBroken([]);
        if (!navigator.onLine) return setStatus("You're offline, so the GIFs can't be checked.");
        setChecking(true);
        try {
            const result = await findBroken((done, total) => setStatus(`Checking ${done} of ${plural(total, "GIF")}.`));
            if (!result.total) setStatus("You have no favorite GIFs.");
            else if (!result.broken.length) setStatus("All your favorite GIFs load.");
            else if (result.broken.length === result.total && result.total >= 3) setStatus("None of your GIFs loaded. Check your connection and try again.");
            else {
                setBroken(result.broken);
                setStatus(`${result.broken.length} of ${plural(result.total, "GIF")} didn't load.`);
            }
        } catch {
            setStatus("Couldn't check the GIFs. Try again.");
        } finally {
            setChecking(false);
        }
    }

    function remove() {
        const count = broken.length;
        setBroken([]);
        removeGifs(broken).then(
            () => setStatus(`Removed ${plural(count, "GIF")} that didn't load.`),
            () => setStatus("Couldn't remove them. Try again.")
        );
    }

    return (
        <div className="vc-ei-transfer">
            <div className="vc-ei-transfer-text">
                <strong>Favorites</strong>
                <span>Move favorite emojis and GIFs between accounts with a file, or check for GIFs that no longer load.</span>
            </div>
            <div className="vc-ei-actions">
                <button type="button" className="vc-ei-button" onClick={() => exportFavorites().then(setStatus, () => setStatus("Couldn't export the favorites. Try again."))}>Export</button>
                <button type="button" className="vc-ei-button vc-ei-primary" onClick={() => importFavorites().then(setStatus, () => setStatus("Couldn't save the favorites. Try again."))}>Import</button>
                <button type="button" className="vc-ei-button" disabled={checking} onClick={check}>Check GIFs</button>
            </div>
            {status && <p className="vc-ei-status" role="status">{status}</p>}
            {broken.length > 0 && (
                <div className="vc-ei-actions vc-ei-confirm">
                    <button type="button" className="vc-ei-button vc-ei-primary" onClick={remove}>Remove {broken.length}</button>
                    <button type="button" className="vc-ei-button" onClick={() => { setBroken([]); setStatus("Kept all your GIFs."); }}>Keep</button>
                </div>
            )}
        </div>
    );
}

function fit(section: HTMLElement, height: number) {
    return Math.round(Math.max(MIN_HEIGHT, Math.min(height, section.getBoundingClientRect().bottom - 8, innerHeight - 16)));
}

const grids = new Set<{ forceUpdate(): void; }>();
let nudgeTimer: ReturnType<typeof setTimeout> | undefined;

function nudge() {
    clearTimeout(nudgeTimer);
    nudgeTimer = setTimeout(() => dispatchEvent(new Event("resize")), 150);
}

function zoom(drawer: HTMLElement) {
    const value = settings.store.scale ? String(Math.min(MAX_ZOOM, Math.max(1, drawer.offsetWidth / BASE_WIDTH))) : "";
    if (drawer.style.getPropertyValue("--vc-ei-zoom") === value) return;
    if (value) drawer.style.setProperty("--vc-ei-zoom", value);
    else drawer.style.removeProperty("--vc-ei-zoom");
    nudge();
}

function setColumns(columns: number) {
    settings.store.columns = columns;
    grids.forEach(grid => grid.forceUpdate());
}

function setHoverPlay(on: boolean) {
    settings.store.hoverPlay = on;
    for (const video of document.querySelectorAll<HTMLVideoElement>(".vc-ei video")) {
        video.autoplay = !on;
        if (on) video.pause();
        else video.play().catch(() => { });
    }
}

function Option({ label, value, onChange }: { label: string; value: boolean; onChange(value: boolean): void; }) {
    return (
        <div className="vc-ei-option">
            <span className="vc-ei-label">{label}</span>
            <button type="button" className="vc-ei-choice" aria-label={label} aria-pressed={value} onClick={() => onChange(!value)}>{value ? "On" : "Off"}</button>
        </div>
    );
}

let panelOpen = false;
const panelListeners = new Set<() => void>();

function setPanel(open: boolean) {
    if (panelOpen === open) return;
    panelOpen = open;
    panelListeners.forEach(listener => listener());
    nudge();
}

function subscribePanel(listener: () => void) {
    panelListeners.add(listener);
    return () => { panelListeners.delete(listener); };
}

const usePanel = () => React.useSyncExternalStore(subscribePanel, () => panelOpen);

function SettingsTab() {
    const open = usePanel();
    return (
        <button type="button" role="tab" id="vc-ei-tab" className="vc-ei-tab" aria-label="Picker settings" aria-selected={open} aria-controls="vc-ei-panel" onClick={() => setPanel(!open)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d={COG} /></svg>
        </button>
    );
}

function Panel({ onReset }: { onReset(): void; }) {
    const { columns, hoverPlay, scale } = settings.use(["columns", "hoverPlay", "scale"]);
    return (
        <div className="vc-ei-panel" id="vc-ei-panel" role="tabpanel" aria-labelledby="vc-ei-tab">
            <div className="vc-ei-option">
                <span className="vc-ei-label">GIFs per row</span>
                <div className="vc-ei-choices" role="group" aria-label="GIFs per row">
                    {COLUMNS.map(n => (
                        <button key={n} type="button" className="vc-ei-choice" aria-pressed={columns === n} onClick={() => setColumns(n)}>{n || "Fit"}</button>
                    ))}
                </div>
            </div>
            <Option label="Play GIFs only on hover" value={hoverPlay} onChange={setHoverPlay} />
            <Option label="Size stickers and emojis to the picker" value={scale} onChange={on => settings.store.scale = on} />
            <div className="vc-ei-option">
                <span className="vc-ei-label">Picker size</span>
                <button type="button" className="vc-ei-button" onClick={onReset}>Reset size</button>
            </div>
            <Transfer />
        </div>
    );
}

function Frame({ onWidthDown, side }: { onWidthDown(e: ReactMouseEvent): void; side: string; }) {
    const ref = useRef<HTMLDivElement>(null);
    const open = usePanel();
    const { scale } = settings.use(["scale"]);
    const section = () => ref.current?.closest("section");

    useEffect(() => {
        const drawer = ref.current?.parentElement;
        if (!drawer) return;
        const close = (e: MouseEvent) => {
            const tab = (e.target as Element).closest?.('[role="tab"]');
            if (tab && tab.id !== "vc-ei-tab") setPanel(false);
        };
        drawer.addEventListener("click", close);
        return () => {
            drawer.removeEventListener("click", close);
            setPanel(false);
        };
    }, []);

    useLayoutEffect(() => {
        const el = section();
        if (el && settings.store.height) el.style.height = `${fit(el, settings.store.height)}px`;
    }, []);

    useLayoutEffect(() => {
        const drawer = ref.current?.parentElement;
        if (!drawer) return;
        zoom(drawer);
        const observer = new ResizeObserver(() => zoom(drawer));
        observer.observe(drawer);
        return () => observer.disconnect();
    }, [scale]);

    function drag(e: ReactMouseEvent) {
        const el = section();
        if (!el) return;
        e.preventDefault();
        const startY = e.clientY, start = el.offsetHeight;
        const move = (ev: MouseEvent) => el.style.height = `${fit(el, start + startY - ev.clientY)}px`;
        const up = () => {
            removeEventListener("mousemove", move);
            removeEventListener("mouseup", up);
            settings.store.height = el.offsetHeight;
        };
        addEventListener("mousemove", move);
        addEventListener("mouseup", up);
    }

    function resetHeight() {
        const el = section();
        if (el) el.style.height = "";
        settings.store.height = 0;
    }

    function resetSize() {
        resetHeight();
        FluxDispatcher.dispatch({ type: "UNSYNCED_USER_SETTINGS_UPDATE", settings: { expressionPickerWidth: "min" } });
        const drawer = ref.current?.parentElement;
        if (drawer) drawer.style.width = `${BASE_WIDTH}px`;
    }

    return (
        <>
            <div ref={ref} className="vc-ei-edge" onMouseDown={e => { e.stopPropagation(); drag(e); }} onDoubleClick={resetHeight} />
            <div className={`vc-ei-corner vc-ei-corner-${side}`} style={{ [side]: -4 }} onMouseDown={e => { drag(e); onWidthDown(e); }} />
            {open && <Panel onReset={resetSize} />}
        </>
    );
}

function GifImage(props: ImgHTMLAttributes<HTMLImageElement>) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const [ready, setReady] = useState(false);
    const { hoverPlay } = settings.use(["hoverPlay"]);
    if (!hoverPlay) return <img {...props} />;

    function grab(e: SyntheticEvent<HTMLImageElement>) {
        const img = e.currentTarget, el = canvas.current;
        if (!el || !img.naturalWidth) return;
        el.width = img.naturalWidth;
        el.height = img.naturalHeight;
        el.getContext("2d")?.drawImage(img, 0, 0);
        setReady(true);
    }

    return (
        <>
            <img {...props} className={classes(props.className, ready && "vc-ei-gif")} onLoad={grab} />
            <canvas ref={canvas} className={classes(props.className, "vc-ei-still", ready && "vc-ei-ready")} style={{ height: props.height }} />
        </>
    );
}

let hovered: HTMLVideoElement | null = null;

function onHover(e: PointerEvent) {
    if (!settings.store.hoverPlay) return;
    const video = (e.target as Element).closest?.(".vc-ei [data-focused]")?.querySelector("video") ?? null;
    if (video === hovered) return;
    hovered?.pause();
    hovered = video;
    video?.play().catch(() => { });
}

export default definePlugin({
    name: "Emoji Interface",
    description: "Restyles the emoji, GIF and sticker picker, lets you resize it from its top edge and corner, sets GIF columns and hover playback, and moves favorites between accounts",
    authors: [{ name: "aquaryuo", id: 975151124824879125n }],
    managedStyle,
    settings,

    patches: [
        {
            find: "handleDrawerResizeHandleMouseDown",
            replacement: [
                {
                    match: /className:(\i\.\i)(,style:\{width:null==\i\?void 0:\i,\[\i\]:0\})/,
                    replace: 'className:$1+" vc-ei"$2'
                },
                {
                    match: /\(0,\i\.jsx\)\("div",\{className:\i\.\i,onMouseDown:(\i),style:\{\[(\i)\]:-2\}\}\)/,
                    replace: "$&,$self.renderFrame($1,$2)"
                },
                {
                    match: /emojiSize:null!=(\i)&&\1<(\i)\?/,
                    replace: "emojiSize:$self.settings.store.scale||null!=$1&&$1<$2?"
                },
                {
                    match: /role:"tablist",.{0,80}?children:\[\i,\i,\i,/,
                    replace: "$&$self.renderTab(),"
                }
            ]
        },
        {
            find: '"tabpanel":void 0,className:',
            replacement: {
                match: /"tabpanel":void 0,className:/,
                replace: '$&"vc-ei-emojis "+'
            }
        },
        {
            find: "oncanplay=this.handleCanPlay",
            replacement: [
                {
                    match: /(\i)\.oncanplay=this\.handleCanPlay,/,
                    replace: "$1.autoplay=!$self.settings.store.hoverPlay,$&"
                },
                {
                    match: /"img",(?=\{src:\i\(\i\),width:)/,
                    replace: "$self.GifImage,"
                }
            ]
        },
        {
            find: "static defaultProps={desiredItemWidth:200}",
            replacement: [
                {
                    match: /function (\i)\((\i),(\i),(\i)\)\{return Math\.min\(Math\.max\(Math\.floor\(\2\/\3\),1\),\4\)\}/,
                    replace: "function $1($2,$3,$4){return $self.columns($2,$3,$4)}"
                },
                {
                    match: /state=\{columns:/,
                    replace: "componentDidMount(){this.vcEi=$self.listen(this)}componentWillUnmount(){this.vcEi?.()}$&"
                }
            ]
        }
    ],

    start() {
        const link = document.createElement("link");
        link.id = "vc-ei-font";
        link.rel = "stylesheet";
        link.href = FONT_URL;
        document.head.append(link);
        document.addEventListener("pointerover", onHover);
    },

    stop() {
        document.getElementById("vc-ei-font")?.remove();
        document.removeEventListener("pointerover", onHover);
        hovered = null;
        clearTimeout(nudgeTimer);
    },

    renderFrame(onWidthDown: (e: ReactMouseEvent) => void, side: string) {
        return (
            <ErrorBoundary noop>
                <Frame onWidthDown={onWidthDown} side={side} />
            </ErrorBoundary>
        );
    },

    renderTab() {
        return (
            <ErrorBoundary noop>
                <SettingsTab />
            </ErrorBoundary>
        );
    },

    columns(width: number, itemWidth: number, max: number) {
        return settings.store.columns || Math.min(Math.max(Math.floor(width / itemWidth), 1), max);
    },

    listen(grid: { forceUpdate(): void; }) {
        grids.add(grid);
        return () => grids.delete(grid);
    },

    GifImage: ErrorBoundary.wrap(GifImage, { noop: true })
});
