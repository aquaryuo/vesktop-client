import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { classes } from "@utils/misc";
import definePlugin, { OptionType } from "@utils/types";
import { chooseFile, saveFile } from "@utils/web";
import { EmojiStore, UserSettingsActionCreators, UserStore, useLayoutEffect, useRef, useState } from "@webpack/common";
import type { ImgHTMLAttributes, MouseEvent as ReactMouseEvent, SyntheticEvent } from "react";

import managedStyle from "./styles.css?managed";

const MIN_HEIGHT = 280;
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

function exportFavorites() {
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
                gifs[url] = { format: gif.format, src: gif.src, width: gif.width, height: gif.height, order: 0 };
        }

    if (!emojis.length && !Object.keys(gifs).length) throw new Error("empty");
    return { emojis, gifs };
}

async function importEmojis(list: Emoji[]) {
    const result = { added: 0, missing: 0, full: 0 };
    if (!list.length) return result;
    await frecency().updateAsync("favoriteEmojis", (data: { emojis: string[]; }) => {
        const have = new Set(data.emojis);
        for (const { id, name } of list) {
            const key = id ?? name!;
            if (have.has(key)) continue;
            if (id && !EmojiStore.getCustomEmojiById(id)) result.missing++;
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
    const result = { added: 0, full: 0 };
    if (!Object.keys(list).length) return result;
    const proto = protoField("favoriteGifs");
    if (!proto) throw new Error("no proto");
    await frecency().updateAsync("favoriteGifs", (data: { gifs: Record<string, Gif>; }) => {
        let order = Object.values(data.gifs).reduce((max, gif) => Math.max(max, gif.order), 0);
        const fresh = Object.entries(list).filter(([url]) => !data.gifs[url]).map(([url, gif]) => [url, { ...gif, order: ++order }] as const);
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
    return lines.join(" ");
}

function Transfer() {
    const [status, setStatus] = useState("");
    return (
        <div className="vc-ei-transfer">
            <div className="vc-ei-transfer-text">
                <strong>Favorites</strong>
                <span>Move favorite emojis and GIFs between accounts with a file.</span>
            </div>
            <div className="vc-ei-actions">
                <button type="button" className="vc-ei-button" onClick={() => setStatus(exportFavorites())}>Export</button>
                <button type="button" className="vc-ei-button vc-ei-primary" onClick={() => importFavorites().then(setStatus, () => setStatus("Couldn't save the favorites. Try again."))}>Import</button>
            </div>
            {status && <p className="vc-ei-status" role="status">{status}</p>}
        </div>
    );
}

function fit(section: HTMLElement, height: number) {
    return Math.round(Math.max(MIN_HEIGHT, Math.min(height, section.getBoundingClientRect().bottom - 8, innerHeight - 16)));
}

function Handles({ onWidthDown, side }: { onWidthDown(e: ReactMouseEvent): void; side: string; }) {
    const ref = useRef<HTMLDivElement>(null);
    const section = () => ref.current?.closest("section");

    useLayoutEffect(() => {
        const el = section();
        if (el && settings.store.height) el.style.height = `${fit(el, settings.store.height)}px`;
    }, []);

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

    function reset() {
        const el = section();
        if (el) el.style.height = "";
        settings.store.height = 0;
    }

    return (
        <>
            <div ref={ref} className="vc-ei-edge" onMouseDown={e => { e.stopPropagation(); drag(e); }} onDoubleClick={reset} />
            <div className={`vc-ei-corner vc-ei-corner-${side}`} style={{ [side]: -4 }} onMouseDown={e => { drag(e); onWidthDown(e); }} />
        </>
    );
}

function GifImage(props: ImgHTMLAttributes<HTMLImageElement>) {
    const canvas = useRef<HTMLCanvasElement>(null);
    const [ready, setReady] = useState(false);
    if (!settings.store.hoverPlay) return <img {...props} />;

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
                    replace: "$&,$self.renderHandles($1,$2)"
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
            find: "desiredItemWidth:200,maxColumns:8",
            replacement: [
                {
                    match: /desiredItemWidth:200,maxColumns:8/,
                    replace: "...$self.grid(8)"
                },
                {
                    match: /(\i)\.autoplay=!0/,
                    replace: "$1.autoplay=!$self.settings.store.hoverPlay"
                },
                {
                    match: /"img",(?=\{src:\i\(\i\),width:)/,
                    replace: "$self.GifImage,"
                }
            ]
        },
        {
            find: "desiredItemWidth:200,maxColumns:6",
            replacement: {
                match: /desiredItemWidth:200,maxColumns:6/,
                replace: "...$self.grid(6)"
            }
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
    },

    renderHandles(onWidthDown: (e: ReactMouseEvent) => void, side: string) {
        return (
            <ErrorBoundary noop>
                <Handles onWidthDown={onWidthDown} side={side} />
            </ErrorBoundary>
        );
    },

    grid(max: number) {
        const { columns } = settings.store;
        return columns ? { desiredItemWidth: 1, maxColumns: columns } : { desiredItemWidth: 200, maxColumns: max };
    },

    GifImage: ErrorBoundary.wrap(GifImage, { noop: true })
});
