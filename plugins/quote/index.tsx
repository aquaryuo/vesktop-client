import { ApplicationCommandInputType, ApplicationCommandOptionType, findOption, generateId, sendBotMessage } from "@api/Commands";
import { definePluginSettings } from "@api/Settings";
import ErrorBoundary from "@components/ErrorBoundary";
import { fetchUserProfile } from "@utils/discord";
import { classes } from "@utils/misc";
import definePlugin, { OptionType } from "@utils/types";
import { saveFile } from "@utils/web";
import type { Message } from "@vencord/discord-types";
import { findByCodeLazy } from "@webpack";
import { applyPalette, GIFEncoder, quantize } from "gifenc";
import { ChannelStore, Constants, FluxDispatcher, GuildMemberStore, IconUtils, MessageStore, PendingReplyStore, React, RestAPI, showToast, UploadHandler, UserProfileStore, UserStore, UserUtils, useEffect, useRef, useState } from "@webpack/common";

import { EFFECTS, EMOJI_BASE, FONTS, loadFonts, PLACES, QuoteContent, QuoteStyle, renderQuote, unloadFonts } from "./draw";
import managedStyle from "./styles.css?managed";

interface Quote {
    content: QuoteContent;
    style: QuoteStyle;
}

const quotes = new Map<string, Quote>();

const createMessageRecord: (raw: any) => Message = findByCodeLazy(".createFromServer(", ".isBlockedForMessage", "messageReference:");

const HELSEA_ID = "1519828760436936704";

async function helseaAuthor() {
    const user = UserStore.getUser(HELSEA_ID) ?? await UserUtils.getUser(HELSEA_ID).catch(() => null);
    if (!user) return;
    return { id: user.id, username: user.username, globalName: user.globalName, discriminator: user.discriminator, avatar: user.avatar, bot: true };
}

const TOGGLES: [keyof QuoteStyle, string, string | { d: string; }][] = [
    ["light", "Light background", { d: "M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" }],
    ["banner", "Banner background", { d: "M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM7 9a2 2 0 1 0 4 0a2 2 0 1 0-4 0M21 15l-3.086-3.086a2 2 0 0 0-2.828 0L6 21" }],
    ["color", "Colour avatar", { d: "M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2zM13.5 6.5h.01M17.5 10.5h.01M8.5 7.5h.01M6.5 12.5h.01" }],
    ["server", "Server profile", { d: "M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM7 21v-2a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2M9 10a3 3 0 1 0 6 0a3 3 0 1 0-6 0" }],
    ["flip", "Swap sides", { d: "m17 2 4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3" }],
    ["bold", "Bold", "B"],
    ["italic", "Italic", "I"],
    ["vertical", "Tall layout", "NEW"],
    ["emojis", "Custom emojis", { d: "M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" }],
    ["stickers", "Stickers", { d: "M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3zM15 3v4a2 2 0 0 0 2 2h4M8 13h.01M16 13h.01M10 16s.8 1 2 1c1.3 0 2-1 2-1" }],
    ["images", "Images", { d: "M18 22H4a2 2 0 0 1-2-2V6M22 13l-1.296-1.296a2.41 2.41 0 0 0-3.408 0L11 18M10 8a2 2 0 1 0 4 0a2 2 0 1 0-4 0M8 2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" }],
    ["credit", "Quoted by", { d: "M12 20h9M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z" }],
];

const ON_BY_DEFAULT: (keyof QuoteStyle)[] = ["emojis", "stickers", "images"];

const settings = definePluginSettings({
    font: {
        type: OptionType.SELECT,
        description: "Default font",
        options: FONTS.map(f => ({ label: `${f.family} (${f.alias})`, value: f.alias, default: f === FONTS[0] }))
    },
    effect: {
        type: OptionType.SELECT,
        description: "Default banner effect",
        options: EFFECTS.map(fx => ({ label: fx.name, value: fx.alias, default: fx === EFFECTS[0] }))
    },
    place: {
        type: OptionType.SELECT,
        description: "Default name position",
        options: PLACES.map(p => ({ label: p.name, value: p.alias, default: p === PLACES[0] }))
    },
    format: {
        type: OptionType.SELECT,
        description: "File type for Send and Save. A GIF can be added to favorite GIFs",
        options: [
            { label: "GIF", value: "gif", default: true },
            { label: "PNG", value: "png" }
        ]
    },
    ...Object.fromEntries(TOGGLES.map(([key, title]) => [key, {
        type: OptionType.SELECT,
        description: title,
        options: [
            { label: "On", value: "on", default: ON_BY_DEFAULT.includes(key) },
            { label: "Off", value: "off", default: !ON_BY_DEFAULT.includes(key) },
            { label: "Always on, toggle hidden", value: "always" },
            { label: "Always off, toggle hidden", value: "never" }
        ]
    } as const]))
});

const locked = (key: keyof QuoteStyle) => settings.store[key] === "always" || settings.store[key] === "never";

async function findMessage(ref: string, channelId: string): Promise<Message | undefined> {
    const link = ref.match(/channels\/(?:@me|\d+)\/(\d+)\/(\d+)/);
    const [cid, mid] = link ? [link[1], link[2]] : [channelId, ref];
    if (!/^\d{17,20}$/.test(mid)) return;

    const cached = MessageStore.getMessage(cid, mid);
    if (cached) return cached;

    const res = await RestAPI.get({
        url: Constants.Endpoints.MESSAGES(cid),
        query: { limit: 1, around: mid },
        retries: 2
    }).catch(() => null);
    const raw = res?.body?.[0];
    if (raw?.id !== mid) return;
    return createMessageRecord(raw);
}

function cleanText(content: string, emojis: { name: string; id: string; }[]) {
    return content
        .replace(/[\uE000-\uF8FF]/g, "")
        .replace(/<a?:(\w+):(\d+)>/g, (_, name, id) => {
            let i = emojis.findIndex(e => e.id === id);
            if (i < 0) i = emojis.push({ name, id }) - 1;
            return String.fromCharCode(EMOJI_BASE + i);
        })
        .replace(/<@!?(\d+)>/g, (_, id) => "@" + (UserStore.getUser(id)?.username ?? "unknown"))
        .replace(/<#(\d+)>/g, (_, id) => "#" + (ChannelStore.getChannel(id)?.name ?? "channel"))
        .replace(/<@&\d+>/g, "@role")
        .trim();
}

async function loadImage(url: string) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Image request failed with ${res.status}`);
    return createImageBitmap(await res.blob());
}

function loadOptional(url: string | false | null | undefined) {
    return url ? loadImage(url).catch(() => undefined) : undefined;
}

async function loadAll(urls: (string | undefined)[]) {
    const images = await Promise.all(urls.map(loadOptional));
    return images.filter((i): i is ImageBitmap => i !== undefined);
}

function stickerURL({ id, format_type }: Message["stickerItems"][number]) {
    if (format_type === 3) return;
    return `https:${window.GLOBAL_ENV.MEDIA_PROXY_ENDPOINT}/stickers/${id}.${format_type === 4 ? "gif" : "png"}?size=320`;
}

function imageURL({ proxy_url, width, height }: Message["attachments"][number]) {
    if (!width || !height) return proxy_url;
    const scale = Math.min(1, 1024 / Math.max(width, height));
    const url = new URL(proxy_url);
    url.searchParams.set("width", String(Math.round(width * scale)));
    url.searchParams.set("height", String(Math.round(height * scale)));
    return url.href;
}

async function toGif(png: Blob) {
    const bitmap = await createImageBitmap(png);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const palette = quantize(data, 256);
    const gif = GIFEncoder();
    gif.writeFrame(applyPalette(data, palette), width, height, { palette });
    gif.finish();
    return new Blob([gif.bytesView() as Uint8Array<ArrayBuffer>], { type: "image/gif" });
}

const FONT_ITEMS = FONTS.map(f => ({ alias: f.alias, name: `${f.family} (${f.alias})` }));

function Icon({ d }: { d: string; }) {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>;
}

function Picker({ label, value, items, onChange }: { label: string; value: string; items: { alias: string; name: string; icon?: string; }[]; onChange: (value: string) => void; }) {
    const compact = items.every(i => i.icon);
    return (
        <select className={classes("vc-quote-select", compact && "vc-quote-compact")} aria-label={label} value={value} onChange={e => onChange(e.currentTarget.value)}>
            <button type="button">
                {React.createElement("selectedcontent")}
                {compact && items.map(i => <span key={i.alias} className="vc-quote-sizer" aria-hidden="true"><Icon d={i.icon!} />{i.name}</span>)}
            </button>
            {items.map(i => <option key={i.alias} value={i.alias}>{i.icon && <Icon d={i.icon} />}{i.name}</option>)}
        </select>
    );
}

function QuoteCard({ quote, channelId }: { quote: Quote; channelId: string; }) {
    const [style, setStyle] = useState(quote.style);
    const [url, setUrl] = useState<string>();
    const blob = useRef<Blob | undefined>(undefined);
    const gif = useRef<Promise<Blob> | undefined>(undefined);

    useEffect(() => {
        quote.style = style;
        let alive = true;
        let made: string | undefined;
        renderQuote(quote.content, style).then(b => {
            if (!alive) return;
            blob.current = b;
            gif.current = undefined;
            made = URL.createObjectURL(b);
            setUrl(made);
        }).catch(() => showToast({ text: "Couldn't draw the quote", variant: "critical" }));
        return () => {
            alive = false;
            if (made) URL.revokeObjectURL(made);
        };
    }, [style]);

    const file = async () => {
        if (!blob.current) return;
        if (settings.store.format !== "gif") return new File([blob.current], "quote.png", { type: "image/png" });
        return new File([await (gif.current ??= toGif(blob.current))], "quote.gif", { type: "image/gif" });
    };

    const send = () => {
        const channel = ChannelStore.getChannel(channelId);
        file().then(f => { if (f && channel) UploadHandler.promptToUpload([f], channel, 0); })
            .catch(() => showToast({ text: "Couldn't prepare the quote", variant: "critical" }));
    };

    const save = () => {
        file().then(f => { if (f) saveFile(f); })
            .catch(() => showToast({ text: "Couldn't save the quote", variant: "critical" }));
    };

    const { serverAvatar, banner, serverBanner, emojis, stickers, images } = quote.content;
    const missing: Partial<Record<keyof QuoteStyle, boolean>> = {
        server: !serverAvatar && !(serverBanner && style.banner),
        banner: !banner && !serverBanner,
        emojis: !emojis.some(e => e.image),
        stickers: !stickers.length,
        images: !images.length
    };

    const copy = () => {
        if (!blob.current) return;
        navigator.clipboard.write([new ClipboardItem({ "image/png": blob.current })])
            .then(() => showToast({ text: settings.store.format === "gif" ? "Quote copied as PNG. The clipboard can't hold a GIF, so use Send or Save for one" : "Quote copied", variant: "success" }))
            .catch(() => showToast({ text: "Couldn't copy the quote", variant: "critical" }));
    };

    return (
        <div className={classes("vc-quote", style.vertical && "vc-quote-vertical")}>
            {url && <img className="vc-quote-image" src={url} alt={`Quote of ${quote.content.name}: ${quote.content.text}`} />}
            <div className="vc-quote-toggles">
                {TOGGLES.filter(([key]) => !locked(key)).map(([key, title, label]) => (
                    <button
                        key={key}
                        type="button"
                        title={missing[key] ? `${title} (not available)` : title}
                        aria-label={title}
                        aria-pressed={!missing[key] && !!style[key]}
                        disabled={missing[key]}
                        className="vc-quote-toggle"
                        onClick={() => setStyle({ ...style, [key]: !style[key] })}
                    >
                        {typeof label === "string" ? label : <Icon d={label.d} />}
                    </button>
                ))}
            </div>
            <div className="vc-quote-actions">
                <Picker label="Font" value={style.font} items={FONT_ITEMS} onChange={font => setStyle({ ...style, font })} />
                {style.banner && !missing.banner && (
                    <Picker label="Banner effect" value={style.effect} items={EFFECTS} onChange={effect => setStyle({ ...style, effect })} />
                )}
                <Picker label="Name position" value={style.place} items={PLACES} onChange={place => setStyle({ ...style, place })} />
                <button type="button" className="vc-quote-button vc-quote-primary" onClick={send}>Send</button>
                <button type="button" className="vc-quote-button" onClick={save}>Save</button>
                <button type="button" className="vc-quote-button" onClick={copy}>Copy</button>
            </div>
        </div>
    );
}

const busy = new Set<string>();

async function loadBanners(userId: string, guildId: string | undefined, webhook: boolean) {
    if (webhook) return [undefined, undefined];
    const profile = await fetchUserProfile(userId, guildId ? { guild_id: guildId } : undefined)
        .catch(() => { FluxDispatcher.dispatch({ type: "USER_PROFILE_FETCH_FAILURE", userId }); });
    const serverProfile = guildId ? UserProfileStore.getGuildMemberProfile(userId, guildId) : null;
    return Promise.all([
        loadOptional(profile?.banner && IconUtils.getUserBannerURL({ id: userId, banner: profile.banner, canAnimate: false, size: 1024 })),
        loadOptional(guildId && serverProfile?.banner && IconUtils.getGuildMemberBannerURL({ id: userId, guildId, banner: serverProfile.banner, canAnimate: false, size: 1024 }))
    ]);
}

async function makeQuote(ref: string, channelId: string) {
    const reply = PendingReplyStore.getPendingReply(channelId);
    if (reply) FluxDispatcher.dispatch({ type: "DELETE_PENDING_REPLY", channelId });

    const [helsea, message] = await Promise.all([helseaAuthor(), ref ? findMessage(ref, channelId) : reply?.message]);
    if (!message) {
        sendBotMessage(channelId, { author: helsea, content: ref ? "Couldn't find that message." : "Reply to a message first, or use /quote-link with a message ID or link." });
        return;
    }

    const emojiRefs: { name: string; id: string; }[] = [];
    const text = cleanText(message.content, emojiRefs);
    const stickerItems = message.stickerItems.filter(s => s.format_type !== 3);
    const attachments = message.attachments.filter(a => a.content_type?.startsWith("image/") && !a.spoiler);
    if (!text && !stickerItems.length && !attachments.length) {
        sendBotMessage(channelId, { author: helsea, content: "That message has nothing to quote." });
        return;
    }

    const { author } = message;
    const guildId = ChannelStore.getChannel(message.channel_id)?.guild_id;
    const member = guildId ? GuildMemberStore.getMember(guildId, author.id) : null;
    try {
        const [avatar, serverAvatar, [banner, serverBanner], emojis, stickers, images] = await Promise.all([
            loadImage(IconUtils.getUserAvatarURL(author, false, 512)),
            loadOptional(guildId && member?.avatar && IconUtils.getGuildMemberAvatarURLSimple({ guildId, userId: author.id, avatar: member.avatar, size: 512 })),
            loadBanners(author.id, guildId, !!message.webhookId),
            Promise.all(emojiRefs.map(async e => ({ name: e.name, image: await loadOptional(IconUtils.getEmojiURL({ id: e.id, animated: false, size: 256 })) }))),
            loadAll(stickerItems.map(stickerURL)),
            loadAll(attachments.slice(0, 4).map(imageURL))
        ]);
        const id = generateId();
        quotes.set(id, {
            content: {
                avatar,
                serverAvatar,
                banner,
                serverBanner,
                text,
                emojis,
                stickers,
                images,
                name: (guildId && GuildMemberStore.getNick(guildId, author.id)) || author.globalName || author.username,
                username: author.username,
                quoter: UserStore.getCurrentUser().username
            },
            style: {
                ...Object.fromEntries(TOGGLES.map(([key]) => [key, settings.store[key] === "on" || settings.store[key] === "always"])),
                font: settings.store.font,
                effect: settings.store.effect,
                place: settings.store.place
            } as QuoteStyle
        });
        sendBotMessage(channelId, { id, author: helsea, content: "" });
    } catch {
        sendBotMessage(channelId, { author: helsea, content: "Couldn't load the avatar for this quote." });
    }
}

function startQuote(ref: string, channelId: string) {
    if (busy.has(channelId)) return;
    busy.add(channelId);
    makeQuote(ref, channelId)
        .catch(() => sendBotMessage(channelId, { content: "Couldn't make that quote." }))
        .finally(() => busy.delete(channelId));
}

export default definePlugin({
    name: "Quote",
    description: "Use /quote while replying to a message, or /quote-link with a message ID or link, to make a quote image only you can see.",
    authors: [{ name: "aquaryuo", id: 975151124824879125n }],
    managedStyle,
    settings,

    start() {
        loadFonts();
    },

    stop() {
        quotes.clear();
        unloadFonts();
    },

    renderMessageAccessory: ({ message }) => {
        const quote = quotes.get(message.id);
        if (!quote) return null;
        return (
            <ErrorBoundary noop>
                <QuoteCard quote={quote} channelId={message.channel_id} />
            </ErrorBoundary>
        );
    },

    patches: [
        {
            find: 'location:"getBuiltInCommands"',
            replacement: {
                match: /(!\i\|\|)(\i)(\.inputType===\i\.\i\.BUILT_IN_TEXT)/,
                replace: "$1$self.canReply($2)||$2$3"
            }
        },
        {
            find: ".chatInputType.commands?.enabled===!0",
            replacement: {
                match: /(\i)&&(\i)\?\.inputType!==(\i\.\i\.BUILT_IN_TEXT)&&/,
                replace: "$1&&!$self.canReply($2)&&$2?.inputType!==$3&&"
            }
        }
    ],

    canReply(command?: { plugin?: string; }) {
        return command?.plugin === "Quote";
    },

    commands: [
        {
            name: "quote",
            description: "Quote the message you're replying to. Only you see it",
            inputType: ApplicationCommandInputType.BUILT_IN,
            execute: (_, { channel }) => startQuote("", channel.id)
        },
        {
            name: "quote-link",
            description: "Quote a message from its link or ID. Only you see it",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [
                {
                    name: "message",
                    description: "Message link, or the ID of a message in this channel",
                    type: ApplicationCommandOptionType.STRING,
                    required: true
                }
            ],
            execute: (args, { channel }) => startQuote(findOption(args, "message", "").trim(), channel.id)
        }
    ]
});
