import { addContextMenuPatch, findGroupChildrenByChildId, NavContextMenuPatchCallback, removeContextMenuPatch } from "@api/ContextMenu";
import * as DataStore from "@api/DataStore";
import { plugins } from "@api/PluginManager";
import { insertTextIntoChatInputBox, sendMessage } from "@utils/discord";
import { chooseFile } from "@utils/web";
import { CloudUpload as TCloudUpload } from "@vencord/discord-types";
import { CloudUploadPlatform } from "@vencord/discord-types/enums";
import { findByCodeLazy, findLazy } from "@webpack";
import { ChannelStore, Constants, ContextMenuApi, EmojiStore, ExpressionPickerStore, FluxDispatcher, GuildStore, IconUtils, Menu, Modal, openModal, PermissionsBits, PermissionStore, React, RestAPI, SelectedChannelStore, showToast, SnowflakeUtils, StickersStore, UploadHandler, UserStore, useEffect, useMemo, useState } from "@webpack/common";
import type { MouseEvent as ReactMouseEvent } from "react";

import { addGifFavorite, isGifFavorite, removeGifFavorite, settings, useParentClass, useStyle } from ".";

export type Kind = "emoji" | "sticker";
export type ItemKind = Kind | "gif";

export interface SavedItem {
    key: string;
    kind: ItemKind;
    link?: string;
    mime?: string;
    name: string;
    id?: string;
    animated?: boolean;
    format?: number;
    tags?: string;
    added: number;
}

interface Source {
    kind: Kind;
    name: string;
    id?: string;
    animated?: boolean;
    format?: number;
    tags?: string;
    preview: string;
    blob(): Promise<Blob>;
}

const INDEX = "EmojiInterface_saved";
const blobKey = (key: string) => `EmojiInterface_blob:${key}`;
const LOTTIE = 3;
const GIF = 4;
const MAX_FILE = 2 * 1024 * 1024;
const MAX_GIF_FILE = 10 * 1024 * 1024;
const GIF_TYPES = /^(image\/(gif|webp|png|avif)|video\/(mp4|webm))$/;
const EMOJI_NAME = /^\w{2,32}$/;
const PLUS = "M12 5v14M5 12h14";
const CLONER_ID = "emote-cloner";

const SILENT = 1 << 12;

const uploadEmoji = findByCodeLazy(".GUILD_EMOJIS(", "EMOJI_UPLOAD_START");
const CloudUpload: typeof TCloudUpload = findLazy(m => m.prototype?.trackUploadFinished);

let items: SavedItem[] = [];
let loaded: Promise<void> | undefined;
const listeners = new Set<() => void>();
const urls = new Map<string, Promise<string>>();

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

export function loadSaved() {
    return loaded ??= DataStore.get<SavedItem[]>(INDEX).then(list => {
        items = Array.isArray(list) ? list : [];
        listeners.forEach(listener => listener());
    });
}

async function commit(next: SavedItem[]) {
    items = next;
    listeners.forEach(listener => listener());
    await DataStore.set(INDEX, next);
}

export function useSaved() {
    useEffect(() => { loadSaved(); }, []);
    return React.useSyncExternalStore(subscribe, () => items);
}

export function revokeUrls() {
    urls.forEach(url => url.then(u => u && URL.revokeObjectURL(u)));
    urls.clear();
}

const savedKey = (kind: Kind, id: string) => `${kind}:${id}`;
const isSaved = (kind: Kind, id: string) => items.some(item => item.key === savedKey(kind, id));

function urlFor(key: string) {
    let url = urls.get(key);
    if (!url) {
        url = DataStore.get<Blob>(blobKey(key)).then(blob => blob ? URL.createObjectURL(blob) : "");
        urls.set(key, url);
    }
    return url;
}

async function blobFor(item: SavedItem) {
    const blob = await DataStore.get<Blob>(blobKey(item.key));
    if (!blob) throw new Error("missing");
    return blob;
}

function discordUrl(kind: Kind, id: string, animated: boolean | undefined, format: number | undefined, size: number) {
    if (kind === "emoji") return `${location.protocol}//${window.GLOBAL_ENV.CDN_HOST}/emojis/${id}.${animated ? "gif" : "png"}?size=${size}&quality=lossless`;
    return `${window.GLOBAL_ENV.MEDIA_PROXY_ENDPOINT}/stickers/${id}.${format === GIF ? "gif" : "png"}?size=${size}`;
}

async function download(url: string, media = false, max = MAX_FILE) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    if (!blob.type.startsWith("image/") && !(media && blob.type.startsWith("video/"))) throw new Error("not an image");
    if (blob.size > max) throw new Error("too big");
    return blob;
}

function fromDiscord(kind: Kind, id: string, name: string, animated?: boolean, format?: number): Source {
    return {
        kind, id, name, animated, format,
        preview: discordUrl(kind, id, animated, format, 128),
        blob: () => download(discordUrl(kind, id, animated, format, kind === "emoji" ? 128 : 320))
    };
}

function fromItem(item: SavedItem): Source {
    return { ...item, kind: item.kind as Kind, preview: "", blob: () => blobFor(item) };
}

async function saveSource(source: Source) {
    await loadSaved();
    const key = source.id ? savedKey(source.kind, source.id) : `${source.kind}:local:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    if (items.some(item => item.key === key)) return;
    const blob = await source.blob();
    let { tags } = source;
    if (source.kind === "sticker" && source.id && !tags) tags = (StickersStore.getStickerById(source.id) as any)?.tags;
    await DataStore.set(blobKey(key), blob);
    await commit([...items, { key, kind: source.kind, name: source.name, id: source.id, animated: source.animated, format: source.format, tags, added: Date.now() }]);
}

async function removeSaved(item: SavedItem) {
    await DataStore.del(blobKey(item.key));
    const url = urls.get(item.key);
    urls.delete(item.key);
    url?.then(u => u && URL.revokeObjectURL(u));
    await commit(items.filter(i => i.key !== item.key));
}

async function saveGif({ link, file }: { link?: string; file?: File; }) {
    await loadSaved();
    if (link && items.some(item => item.kind === "gif" && item.link === link)) return "It's already in Downloads.";
    const blob = file ?? await download(link!, true, MAX_GIF_FILE).catch(() => { throw new Error("Couldn't download it."); });
    if (!GIF_TYPES.test(blob.type)) throw new Error("That isn't a GIF or a video.");
    if (blob.size > MAX_GIF_FILE) throw new Error("That file is over 10 MB.");
    const key = `gif:local:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    await DataStore.set(blobKey(key), blob);
    await commit([...items, { key, kind: "gif", name: nameFrom(file?.name ?? link!) || "gif", link, mime: blob.type, added: Date.now() }]);
    return "Saved to Downloads.";
}

function randomName() {
    return Array.from(crypto.getRandomValues(new Uint8Array(6)), byte => byte.toString(16).padStart(2, "0")).join("");
}

function extension(name: string, type: string) {
    return name.match(/\.\w{2,5}$/)?.[0].toLowerCase() ?? `.${type.split("/")[1]?.replace("jpeg", "jpg") || "png"}`;
}

async function postGif(file: File) {
    const channel = ChannelStore.getChannel(settings.store.storageChannel);
    if (!channel) throw new Error("Pick a channel for GIF files in the picker settings to star them.");
    const name = `${settings.store.randomNames ? randomName() : nameFrom(file.name) || "gif"}${extension(file.name, file.type)}`;
    const upload = new CloudUpload({ file: new File([file], name, { type: file.type }), isThumbnail: false, platform: CloudUploadPlatform.WEB }, channel.id);
    await new Promise<void>((resolve, reject) => {
        upload.on("complete", () => resolve());
        upload.on("error", () => reject(new Error("The upload failed.")));
        upload.upload();
    });
    const res = await RestAPI.post({
        url: Constants.Endpoints.MESSAGES(channel.id),
        body: {
            flags: SILENT,
            channel_id: channel.id,
            content: "",
            nonce: SnowflakeUtils.fromTimestamp(Date.now()),
            sticker_ids: [],
            type: 0,
            attachments: [{ id: "0", filename: upload.filename, uploaded_filename: upload.uploadedFilename }]
        }
    }).catch(e => { throw new Error(apiMessage(e)); });
    const link: string | undefined = res.body?.attachments?.[0]?.url;
    if (!link) throw new Error("Discord didn't return a link for it.");
    return link;
}

export async function addGifLink(link: string, file?: File) {
    const [star, copy] = await Promise.allSettled([addGifFavorite(link), saveGif({ link, file })]);
    const starred = star.status === "fulfilled" ? star.value : "Couldn't star it.";
    const saved = copy.status === "fulfilled" ? copy.value : `No copy in Downloads: ${(copy.reason as Error)?.message ?? "the download failed."}`;
    return `${starred} ${saved}`;
}

export async function addGifFile(file: File) {
    if (!GIF_TYPES.test(file.type)) return "That isn't a GIF or a video.";
    if (file.size > MAX_GIF_FILE) return "That file is over 10 MB.";
    if (!settings.store.storageChannel) {
        const saved = await saveGif({ file }).catch((e: Error) => e.message);
        return `${saved} To star GIF files, pick a channel for them in the picker settings.`;
    }
    showToast({ text: "Posting the GIF so it can be starred..." });
    try {
        return await addGifLink(await postGif(file), file);
    } catch (e: any) {
        const saved = await saveGif({ file }).catch((err: Error) => err.message);
        return `${e?.message ?? "Couldn't post it."} ${saved}`;
    }
}

function canUse(item: SavedItem, channel: any) {
    if (!item.id) return false;
    const nitro = (UserStore.getCurrentUser()?.premiumType ?? 0) > 0;
    const external = (perm: bigint) => nitro && (channel.isPrivate() || PermissionStore.can(perm, channel));
    if (item.kind === "emoji") {
        const emoji: any = EmojiStore.getCustomEmojiById(item.id);
        if (!emoji || emoji.available === false) return false;
        return emoji.guildId === channel.guild_id || external(PermissionsBits.USE_EXTERNAL_EMOJIS);
    }
    const sticker: any = StickersStore.getStickerById(item.id);
    if (!sticker?.guild_id || sticker.available === false) return false;
    return sticker.guild_id === channel.guild_id || external(PermissionsBits.USE_EXTERNAL_STICKERS);
}

function linkFor(item: SavedItem) {
    if (!item.id) return "";
    if (item.kind === "emoji") return `${discordUrl("emoji", item.id, item.animated, undefined, 48)}&name=${encodeURIComponent(item.name)}`;
    return discordUrl("sticker", item.id, undefined, item.format, 160);
}

function fileName(item: SavedItem, blob: Blob) {
    const base = settings.store.randomNames ? randomName() : item.name.replace(/[^\w-]+/g, "_") || item.kind;
    return `${base}${extension("", blob.type)}`;
}

export async function sendSaved(item: SavedItem, how?: "file" | "link") {
    const channel = ChannelStore.getChannel(SelectedChannelStore.getChannelId());
    if (!channel) return;
    if (item.kind === "gif" && how !== "file" && item.link) {
        sendMessage(channel.id, { content: item.link });
    } else if (item.kind === "gif") {
        const blob = await blobFor(item);
        UploadHandler.promptToUpload([new File([blob], fileName(item, blob), { type: blob.type })], channel, 0);
    } else if (!how && canUse(item, channel)) {
        if (item.kind === "emoji") insertTextIntoChatInputBox(`<${item.animated ? "a" : ""}:${item.name}:${item.id}> `);
        else sendMessage(channel.id, { content: "" }, true, { stickerIds: [item.id!] } as any);
    } else if ((how ?? settings.store.savedSend) === "link" && item.id) {
        insertTextIntoChatInputBox(`${linkFor(item)} `);
    } else {
        const blob = await blobFor(item);
        UploadHandler.promptToUpload([new File([blob], fileName(item, blob), { type: blob.type })], channel, 0);
    }
    ExpressionPickerStore.closeExpressionPicker();
}

function SavedImage({ item }: { item: SavedItem; }) {
    const [src, setSrc] = useState("");
    useEffect(() => {
        let live = true;
        urlFor(item.key).then(url => live && setSrc(url));
        return () => { live = false; };
    }, [item.key]);
    if (!src) return <span className="vc-ei-saved-blank" />;
    if (item.mime?.startsWith("video/")) return <video src={src} muted loop playsInline preload="metadata" onMouseEnter={e => e.currentTarget.play().catch(() => { })} onMouseLeave={e => e.currentTarget.pause()} />;
    return <img src={src} alt="" loading="lazy" decoding="async" draggable={false} />;
}

function openItemMenu(e: ReactMouseEvent, item: SavedItem) {
    const gif = item.kind === "gif";
    const starred = gif && !!item.link && isGifFavorite(item.link);
    const entries = gif
        ? [
            <Menu.MenuItem key="file" id="vc-ei-send-file" label="Send as file" action={() => sendSaved(item, "file")} />,
            <Menu.MenuItem key="link" id="vc-ei-send-link" label="Send link" disabled={!item.link} action={() => sendSaved(item, "link")} />,
            <Menu.MenuItem key="star" id="vc-ei-star" label={starred ? "Remove from favorite GIFs" : "Add to favorite GIFs"} disabled={!item.link} action={() => {
                const done = (text: string) => showToast({ text });
                if (starred) removeGifFavorite(item.link!).then(() => done("Removed from favorite GIFs. It stays in Downloads."));
                else addGifFavorite(item.link!).then(done);
            }} />
        ]
        : [
            <Menu.MenuItem key="file" id="vc-ei-send-file" label="Send as file" action={() => sendSaved(item, "file")} />,
            <Menu.MenuItem key="link" id="vc-ei-send-link" label="Paste link" disabled={!item.id} action={() => sendSaved(item, "link")} />,
            <Menu.MenuItem key="clone" id="vc-ei-clone" label="Clone to a server" action={() => openClone(fromItem(item))} />
        ];
    ContextMenuApi.openContextMenu(e, () => (
        <Menu.Menu navId="vc-ei-saved" onClose={ContextMenuApi.closeContextMenu} aria-label={item.name}>
            {entries}
            <Menu.MenuItem id="vc-ei-remove" label="Remove from Downloads" color="danger" action={() => removeSaved(item)} />
        </Menu.Menu>
    ));
}

function SavedGrid({ list }: { list: SavedItem[]; }) {
    const [armed, setArmed] = useState("");
    function pick(item: SavedItem) {
        if (item.kind === "gif" && settings.store.gifGuard && armed !== item.key) {
            setArmed(item.key);
            setTimeout(() => setArmed(key => key === item.key ? "" : key), 4000);
            return;
        }
        setArmed("");
        sendSaved(item);
    }
    return (
        <div className="vc-ei-saved-grid" data-kind={list[0]?.kind}>
            {list.map(item => (
                <div key={item.key} className={`vc-ei-saved-cell vc-ei-saved-${item.kind}`} data-vc-ei-armed={armed === item.key || undefined}>
                    <button type="button" className="vc-ei-saved-item" title={item.name} aria-label={item.name} onClick={() => pick(item)} onContextMenu={e => openItemMenu(e, item)}>
                        <SavedImage item={item} />
                    </button>
                    <button type="button" className="vc-ei-saved-remove" aria-label={`Remove ${item.name}`} title="Remove" onClick={() => removeSaved(item)}>×</button>
                </div>
            ))}
        </div>
    );
}

export function SavedPanel() {
    const list = useSaved();
    const [query, setQuery] = useState("");
    const shown = query ? list.filter(item => item.name.toLowerCase().includes(query.toLowerCase())) : list;
    const emojis = shown.filter(item => item.kind === "emoji"), stickers = shown.filter(item => item.kind === "sticker"), gifs = shown.filter(item => item.kind === "gif");
    return (
        <div className="vc-ei-panel vc-ei-saved" id="vc-ei-saved-panel" role="tabpanel" aria-labelledby="vc-ei-saved-tab">
            <div className="vc-ei-saved-head">
                <input className="vc-ei-input" type="search" placeholder="Search downloads" aria-label="Search downloads" value={query} onChange={e => setQuery(e.currentTarget.value)} />
                <PlusButton kind="all" />
            </div>
            {!list.length && <p className="vc-ei-status">Nothing here yet. Right-click an emoji or sticker and choose Save to Downloads, drop a GIF on the GIF tab, or use the plus button.</p>}
            {emojis.length > 0 && <section><h3 className="vc-ei-heading">Emojis</h3><SavedGrid list={emojis} /></section>}
            {stickers.length > 0 && <section><h3 className="vc-ei-heading">Stickers</h3><SavedGrid list={stickers} /></section>}
            {gifs.length > 0 && <section><h3 className="vc-ei-heading">GIFs</h3><SavedGrid list={gifs} /></section>}
            {list.length > 0 && !shown.length && <p className="vc-ei-status">Nothing in Downloads matches.</p>}
        </div>
    );
}

export function SavedStrip({ kind }: { kind: Kind; }) {
    useStyle();
    const { savedPlace } = settings.use(["savedPlace"]);
    const list = useSaved().filter(item => item.kind === kind);
    const ref = useParentClass<HTMLDivElement>("vc-ei-strip-host", savedPlace !== "tab" && list.length > 0);
    if (savedPlace === "tab" || !list.length) return null;
    return (
        <div className="vc-ei-strip" ref={ref}>
            <span className="vc-ei-heading">Downloads</span>
            <div className="vc-ei-strip-row" onWheel={e => { e.currentTarget.scrollLeft += e.deltaY; }}>
                <SavedGrid list={list} />
            </div>
        </div>
    );
}

function candidates() {
    const me = UserStore.getCurrentUser().id;
    return Object.values(GuildStore.getGuilds()).filter((guild: any) => guild.ownerId === me
        || (PermissionStore.getGuildPermissions({ id: guild.id } as any) & PermissionsBits.CREATE_GUILD_EXPRESSIONS) === PermissionsBits.CREATE_GUILD_EXPRESSIONS
    ).sort((a: any, b: any) => a.name.localeCompare(b.name)) as any[];
}

function readDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

async function cloneTo(guildId: string, source: Source, name: string) {
    const blob = await source.blob();
    if (source.kind === "emoji") return uploadEmoji({ guildId, name, image: await readDataUrl(blob) });
    const data = new FormData();
    data.append("name", name);
    data.append("tags", source.tags || name);
    data.append("description", "");
    data.append("file", blob);
    const { body } = await RestAPI.post({ url: Constants.Endpoints.GUILD_STICKER_PACKS(guildId), body: data });
    FluxDispatcher.dispatch({ type: "GUILD_STICKERS_CREATE_SUCCESS", guildId, sticker: { ...body, user: UserStore.getCurrentUser() } });
}

function apiMessage(e: any) {
    try {
        return JSON.parse(e.text).message;
    } catch {
        return e?.body?.message ?? e?.message ?? "something went wrong";
    }
}

function Preview({ source }: { source: Source; }) {
    const [src, setSrc] = useState(source.preview);
    useEffect(() => {
        if (source.preview) return;
        let url = "";
        source.blob().then(blob => setSrc(url = URL.createObjectURL(blob)), () => { });
        return () => { if (url) URL.revokeObjectURL(url); };
    }, [source]);
    return src ? <img className="vc-ei-modal-preview" src={src} alt="" /> : null;
}

function CloneModal({ source }: { source: Source; }) {
    useStyle();
    const [name, setName] = useState(source.kind === "emoji" ? source.name.split("~")[0].replace(/\W/g, "_") : source.name);
    const [busy, setBusy] = useState("");
    const [status, setStatus] = useState("");
    const guilds = useMemo(candidates, []);
    const valid = source.kind === "emoji" ? EMOJI_NAME.test(name) : name.length >= 2 && name.length <= 30;

    async function clone(guild: any) {
        setBusy(guild.id);
        setStatus("");
        try {
            await cloneTo(guild.id, source, name);
            setStatus(`Cloned ${name} to ${guild.name}.`);
        } catch (e) {
            setStatus(`Couldn't clone to ${guild.name}: ${apiMessage(e)}.`);
        } finally {
            setBusy("");
        }
    }

    return (
        <div className="vc-ei-modal">
            <Preview source={source} />
            <label className="vc-ei-label" htmlFor="vc-ei-clone-name">Name</label>
            <input id="vc-ei-clone-name" className="vc-ei-input" value={name} maxLength={32} onChange={e => setName(e.currentTarget.value)} aria-invalid={!valid} />
            {!valid && <p className="vc-ei-status">{source.kind === "emoji" ? "Use 2 to 32 letters, numbers or underscores." : "Use 2 to 30 characters."}</p>}
            {guilds.length ? (
                <div className="vc-ei-guilds" role="group" aria-label="Servers you can add to">
                    {guilds.map(guild => (
                        <button key={guild.id} type="button" className="vc-ei-guild" title={guild.name} aria-label={`Clone to ${guild.name}`} disabled={!!busy || !valid} onClick={() => clone(guild)}>
                            {guild.icon
                                ? <img src={IconUtils.getGuildIconURL({ id: guild.id, icon: guild.icon, canAnimate: false, size: 96 })} alt="" />
                                : <span>{guild.name.split(/\s+/).map((w: string) => w[0]).join("").slice(0, 3)}</span>}
                        </button>
                    ))}
                </div>
            ) : <p className="vc-ei-status">You don't manage expressions in any server.</p>}
            {(busy || status) && <p className="vc-ei-status" role="status">{busy ? "Cloning..." : status}</p>}
        </div>
    );
}

function openClone(source: Source) {
    openModal(props => (
        <Modal {...props} size="sm" title={`Clone ${source.kind} to a server`}>
            <CloneModal source={source} />
        </Modal>
    ));
}

function nameFrom(text: string) {
    return text.replace(/[?#].*$/, "").split("/").pop()!.replace(/\.[^.]+$/, "").replace(/\W/g, "_").slice(0, 32);
}

function SaveModal({ kind: initial, from, file, link: initialLink = "", onClose }: { kind: Kind; from: "file" | "link"; file?: File; link?: string; onClose(): void; }) {
    useStyle();
    const [kind, setKind] = useState<Kind>(initial);
    const [name, setName] = useState(file ? nameFrom(file.name) : initialLink ? nameFrom(initialLink) : "");
    const [link, setLink] = useState(initialLink);
    const [status, setStatus] = useState("");
    const valid = kind === "emoji" ? EMOJI_NAME.test(name) : name.length >= 2 && name.length <= 30;

    async function save() {
        setStatus("Saving...");
        try {
            let blob: Blob;
            if (file) {
                if (!file.type.startsWith("image/") || file.size > MAX_FILE) throw new Error("Pick an image up to 2 MB.");
                blob = file;
            } else {
                let url: URL;
                try {
                    url = new URL(link);
                } catch {
                    throw new Error("That isn't a valid link.");
                }
                if (url.protocol !== "https:") throw new Error("Use an https link.");
                blob = await download(url.href).catch(() => { throw new Error("Couldn't download that link. Discord image links work best."); });
            }
            await saveSource({ kind, name, animated: blob.type === "image/gif", preview: "", blob: async () => blob });
            onClose();
        } catch (e: any) {
            setStatus(e?.message ?? "Couldn't save it.");
        }
    }

    return (
        <div className="vc-ei-modal">
            <div className="vc-ei-choices" role="group" aria-label="Save as">
                {(["emoji", "sticker"] as const).map(k => (
                    <button key={k} type="button" className="vc-ei-choice" aria-pressed={kind === k} onClick={() => setKind(k)}>{k === "emoji" ? "Emoji" : "Sticker"}</button>
                ))}
            </div>
            {from === "link" && (
                <>
                    <label className="vc-ei-label" htmlFor="vc-ei-save-link">Image link</label>
                    <input id="vc-ei-save-link" className="vc-ei-input" type="url" placeholder="https://cdn.discordapp.com/emojis/..." value={link} onChange={e => setLink(e.currentTarget.value)} />
                </>
            )}
            <label className="vc-ei-label" htmlFor="vc-ei-save-name">Name</label>
            <input id="vc-ei-save-name" className="vc-ei-input" value={name} maxLength={32} onChange={e => setName(e.currentTarget.value)} aria-invalid={!valid} />
            <div className="vc-ei-actions">
                <button type="button" className="vc-ei-button vc-ei-primary" disabled={!valid || (from === "link" && !link)} onClick={save}>Save</button>
                <button type="button" className="vc-ei-button" onClick={onClose}>Cancel</button>
            </div>
            {status && <p className="vc-ei-status" role="status">{status}</p>}
        </div>
    );
}

function openSaveModal(kind: Kind, file?: File, link?: string) {
    const from = file ? "file" : "link";
    openModal(props => (
        <Modal {...props} size="sm" title={from === "file" ? "Save from a file" : "Save from a link"}>
            <SaveModal kind={kind} from={from} file={file} link={link} onClose={props.onClose} />
        </Modal>
    ));
}

async function openSave(kind: Kind, from: "file" | "link") {
    if (from === "link") return openSaveModal(kind);
    const file = await chooseFile("image/png,image/gif,image/webp,image/jpeg");
    if (file) openSaveModal(kind, file);
}

export function saveDropped(kind: Kind, file?: File, link?: string) {
    if (file && !file.type.startsWith("image/")) return "Emojis and stickers need an image.";
    openSaveModal(kind, file, link);
    return "";
}

async function uploadFile(kind: Kind) {
    const file = await chooseFile("image/png,image/gif,image/webp,image/jpeg");
    if (!file) return;
    openClone({ kind, name: file.name.replace(/\.[^.]+$/, ""), animated: file.type === "image/gif", preview: "", blob: async () => file });
}

function GifLinkModal({ onClose }: { onClose(): void; }) {
    useStyle();
    const [link, setLink] = useState("");
    const [status, setStatus] = useState("");
    const [busy, setBusy] = useState(false);
    async function add() {
        setBusy(true);
        setStatus("");
        const text = await addGifLink(link.trim());
        setBusy(false);
        if (text.startsWith("Added")) {
            showToast({ text });
            onClose();
        } else setStatus(text);
    }
    return (
        <div className="vc-ei-modal">
            <label className="vc-ei-label" htmlFor="vc-ei-gif-link">Direct link to a GIF, WebP, MP4 or WebM</label>
            <input id="vc-ei-gif-link" className="vc-ei-input" type="url" placeholder="https://media.discordapp.net/attachments/..." value={link} onChange={e => setLink(e.currentTarget.value)} onKeyDown={e => { if (e.key === "Enter" && link.trim()) add(); }} />
            <div className="vc-ei-actions">
                <button type="button" className="vc-ei-button vc-ei-primary" disabled={busy || !link.trim()} onClick={add}>Add</button>
                <button type="button" className="vc-ei-button" onClick={onClose}>Cancel</button>
            </div>
            {(busy || status) && <p className="vc-ei-status" role="status">{busy ? "Adding..." : status}</p>}
        </div>
    );
}

function openGifLink() {
    openModal(props => (
        <Modal {...props} size="sm" title="Add a GIF from a link">
            <GifLinkModal onClose={props.onClose} />
        </Modal>
    ));
}

async function openGifFile() {
    const file = await chooseFile("image/gif,image/webp,video/mp4,video/webm");
    if (file) showToast({ text: await addGifFile(file) });
}

export function PlusButton({ kind, onUpload, uploadDisabled }: { kind: ItemKind | "all"; onUpload?(): void; uploadDisabled?: boolean; }) {
    const ref = useParentClass<HTMLButtonElement>("vc-ei-plus-host");
    const label = kind === "emoji" ? "Add emoji" : kind === "sticker" ? "Add sticker" : kind === "gif" ? "Add GIF" : "Add to Downloads";
    const gifItems = [
        <Menu.MenuItem key="gif-file" id="vc-ei-gif-file" label="Add a GIF from a file" action={openGifFile} />,
        <Menu.MenuItem key="gif-link" id="vc-ei-gif-link" label="Add a GIF from a link" action={openGifLink} />
    ];
    const entries = kind === "gif" ? gifItems : kind === "all"
        ? [
            <Menu.MenuItem key="file" id="vc-ei-save-file" label="Save an emoji or sticker from a file" action={() => openSave("emoji", "file")} />,
            <Menu.MenuItem key="link" id="vc-ei-save-link" label="Save an emoji or sticker from a link" action={() => openSave("emoji", "link")} />,
            ...gifItems
        ]
        : [
            onUpload && <Menu.MenuItem key="upload" id="vc-ei-upload" label="Upload emoji" disabled={uploadDisabled} action={onUpload} />,
            <Menu.MenuItem key="server" id="vc-ei-upload-server" label={`Upload a ${kind} file to a server`} action={() => uploadFile(kind)} />,
            <Menu.MenuItem key="file" id="vc-ei-save-file" label={`Save ${kind === "emoji" ? "an emoji" : "a sticker"} from a file`} action={() => openSave(kind, "file")} />,
            <Menu.MenuItem key="link" id="vc-ei-save-link" label={`Save ${kind === "emoji" ? "an emoji" : "a sticker"} from a link`} action={() => openSave(kind, "link")} />
        ].filter(Boolean);
    return (
        <button type="button" className="vc-ei-plus" ref={ref} aria-label={label} title={label} onClick={e => ContextMenuApi.openContextMenu(e, () => (
            <Menu.Menu navId="vc-ei-add" onClose={ContextMenuApi.closeContextMenu} aria-label={label}>
                {entries}
            </Menu.Menu>
        ))}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d={PLUS} /></svg>
        </button>
    );
}

function menuItems(source: Source) {
    const saved = !!source.id && isSaved(source.kind, source.id);
    return [
        <Menu.MenuItem key="vc-ei-save" id="vc-ei-save" label={saved ? "Remove from Downloads" : "Save to Downloads"} action={() => {
            if (saved) {
                const item = items.find(i => i.key === savedKey(source.kind, source.id!));
                if (item) removeSaved(item);
            } else saveSource(source).catch(() => { });
        }} />,
        <Menu.MenuItem key="vc-ei-clone" id="vc-ei-clone" label={`Clone ${source.kind} to a server`} action={() => openClone(source)} />
    ];
}

function hideCloner(navId: string, children: any[]) {
    const cloner: any = plugins.ExpressionCloner;
    const patch = cloner?.contextMenus?.[navId];
    if (cloner?.started && patch) removeContextMenuPatch(navId, patch);
    const group = findGroupChildrenByChildId(CLONER_ID, children);
    const index = group?.findIndex(child => child?.props?.id === CLONER_ID) ?? -1;
    if (group && index >= 0) group.splice(index, 1);
}

export function restoreCloner() {
    const cloner: any = plugins.ExpressionCloner;
    if (!cloner?.started) return;
    for (const [navId, patch] of Object.entries(cloner.contextMenus ?? {}))
        addContextMenuPatch(navId, patch as NavContextMenuPatchCallback);
}

function emojiName(id: string, message: any) {
    const known: any = EmojiStore.getCustomEmojiById(id);
    if (known) return known.name as string;
    const reaction = message?.reactions?.find((r: any) => r.emoji.id === id);
    if (reaction) return reaction.emoji.name as string;
    return message?.content?.match(new RegExp(`<a?:(\\w+)(?:~\\d+)?:${id}>`))?.[1] as string | undefined;
}

function animatedUrl(url?: string) {
    if (!url) return false;
    try {
        const parsed = new URL(url);
        return parsed.pathname.endsWith(".gif") || parsed.searchParams.get("animated") === "true";
    } catch {
        return false;
    }
}

export const messageMenu: NavContextMenuPatchCallback = (children, props: any) => {
    hideCloner("message", children);
    const { favoriteableId: id, favoriteableType: type, itemHref, itemSrc, message } = props ?? {};
    if (!id) return;
    let source: Source | undefined;
    if (type === "emoji") {
        const name = emojiName(id, message);
        if (name) source = fromDiscord("emoji", id, name, animatedUrl(itemHref ?? itemSrc));
    } else if (type === "sticker") {
        const sticker = message?.stickerItems?.find((s: any) => s.id === id);
        if (sticker && sticker.format_type !== LOTTIE) source = fromDiscord("sticker", id, sticker.name, undefined, sticker.format_type);
    }
    if (source) (findGroupChildrenByChildId("copy-link", children) ?? children).push(...menuItems(source));
};

export const pickerMenu: NavContextMenuPatchCallback = (children, props: any) => {
    hideCloner("expression-picker", children);
    const { id, name, type, animated, formatType } = props?.target?.dataset ?? {};
    if (!id) return;
    if (type === "emoji" && name) children.push(...menuItems(fromDiscord("emoji", id, name, animated === "true")));
    else if (type === "sticker" && Number(formatType) !== LOTTIE) children.push(...menuItems(fromDiscord("sticker", id, name ?? "sticker", undefined, Number(formatType))));
};
