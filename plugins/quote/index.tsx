import { ApplicationCommandInputType, ApplicationCommandOptionType, findOption, generateId, sendBotMessage } from "@api/Commands";
import ErrorBoundary from "@components/ErrorBoundary";
import { fetchUserProfile } from "@utils/discord";
import { classes } from "@utils/misc";
import definePlugin from "@utils/types";
import type { Message } from "@vencord/discord-types";
import { ChannelStore, Constants, FluxDispatcher, GuildMemberStore, IconUtils, MessageStore, PendingReplyStore, RestAPI, showToast, UploadHandler, UserProfileStore, UserStore, UserUtils, useEffect, useRef, useState } from "@webpack/common";

import { EFFECTS, EMOJI_BASE, FONTS, loadFonts, PLACES, QuoteContent, QuoteStyle, renderQuote, unloadFonts } from "./draw";
import managedStyle from "./styles.css?managed";

interface Quote {
    content: QuoteContent;
    style: QuoteStyle;
}

const quotes = new Map<string, Quote>();

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
    return MessageStore.getMessages(raw.channel_id).receiveMessage(raw).get(raw.id);
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

function QuoteCard({ quote, channelId }: { quote: Quote; channelId: string; }) {
    const [style, setStyle] = useState(quote.style);
    const [url, setUrl] = useState<string>();
    const blob = useRef<Blob | undefined>(undefined);

    useEffect(() => {
        quote.style = style;
        let alive = true;
        let made: string | undefined;
        renderQuote(quote.content, style).then(b => {
            if (!alive) return;
            blob.current = b;
            made = URL.createObjectURL(b);
            setUrl(made);
        }).catch(() => showToast({ text: "Couldn't draw the quote", variant: "critical" }));
        return () => {
            alive = false;
            if (made) URL.revokeObjectURL(made);
        };
    }, [style]);

    const send = () => {
        const channel = ChannelStore.getChannel(channelId);
        if (blob.current && channel) UploadHandler.promptToUpload([new File([blob.current], "quote.png", { type: "image/png" })], channel, 0);
    };

    const { serverAvatar, banner, serverBanner, emojis, stickers, images } = quote.content;
    const hidden: Partial<Record<keyof QuoteStyle, boolean>> = {
        server: !serverAvatar && !serverBanner,
        banner: !banner && !serverBanner,
        emojis: !emojis.some(e => e.image),
        stickers: !stickers.length,
        images: !images.length
    };

    const copy = () => {
        if (!blob.current) return;
        navigator.clipboard.write([new ClipboardItem({ "image/png": blob.current })])
            .then(() => showToast({ text: "Quote copied", variant: "success" }))
            .catch(() => showToast({ text: "Couldn't copy the quote", variant: "critical" }));
    };

    return (
        <div className={classes("vc-quote", style.vertical && "vc-quote-vertical")}>
            {url && <img className="vc-quote-image" src={url} alt={`Quote of ${quote.content.name}: ${quote.content.text}`} />}
            <div className="vc-quote-toggles">
                {TOGGLES.filter(([key]) => !hidden[key]).map(([key, title, label]) => (
                    <button
                        key={key}
                        type="button"
                        title={title}
                        aria-label={title}
                        aria-pressed={!!style[key]}
                        className="vc-quote-toggle"
                        onClick={() => setStyle({ ...style, [key]: !style[key] })}
                    >
                        {typeof label === "string" ? label : <svg viewBox="0 0 24 24" aria-hidden="true"><path d={label.d} /></svg>}
                    </button>
                ))}
            </div>
            <div className="vc-quote-actions">
                <select
                    className="vc-quote-select"
                    aria-label="Font"
                    value={style.font}
                    onChange={e => setStyle({ ...style, font: e.currentTarget.value })}
                >
                    {FONTS.map(f => <option key={f.alias} value={f.alias}>{`${f.family} (${f.alias})`}</option>)}
                </select>
                {style.banner && (
                    <select
                        className="vc-quote-select"
                        aria-label="Banner effect"
                        value={style.effect}
                        onChange={e => setStyle({ ...style, effect: e.currentTarget.value })}
                    >
                        {EFFECTS.map(fx => <option key={fx.alias} value={fx.alias}>{fx.name}</option>)}
                    </select>
                )}
                <select
                    className="vc-quote-select"
                    aria-label="Name position"
                    value={style.place}
                    onChange={e => setStyle({ ...style, place: e.currentTarget.value })}
                >
                    {PLACES.map(p => <option key={p.alias} value={p.alias}>{p.name}</option>)}
                </select>
                <button type="button" className="vc-quote-button vc-quote-primary" onClick={send}>Send</button>
                <button type="button" className="vc-quote-button" onClick={copy}>Copy</button>
            </div>
        </div>
    );
}

export default definePlugin({
    name: "Quote",
    description: "Use /quote while replying to a message, or give it a message ID or link, to make a quote image only you can see.",
    authors: [{ name: "aquaryuo", id: 975151124824879125n }],
    managedStyle,

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

    commands: [
        {
            name: "quote",
            description: "Make a quote image of a message. Only you see it",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [
                {
                    name: "message",
                    description: "Message ID or link. Leave empty to quote the message you're replying to",
                    type: ApplicationCommandOptionType.STRING,
                    required: false
                },
                {
                    name: "font",
                    description: "Font for the quote",
                    type: ApplicationCommandOptionType.STRING,
                    required: false,
                    choices: FONTS.map(f => ({ name: f.alias, label: `${f.family} (${f.alias})`, value: f.alias, displayName: `${f.family} (${f.alias})` }))
                }
            ],
            execute: async (args, { channel }) => {
                const ref = findOption(args, "message", "").trim();
                const reply = PendingReplyStore.getPendingReply(channel.id);
                if (reply) FluxDispatcher.dispatch({ type: "DELETE_PENDING_REPLY", channelId: channel.id });

                const helsea = await helseaAuthor();
                const message = ref ? await findMessage(ref, channel.id) : reply?.message;
                if (!message) {
                    sendBotMessage(channel.id, { author: helsea, content: ref ? "Couldn't find that message." : "Reply to a message, or give a message ID or link." });
                    return;
                }

                const emojiRefs: { name: string; id: string; }[] = [];
                const text = cleanText(message.content, emojiRefs);
                const stickerItems = message.stickerItems.filter(s => s.format_type !== 3);
                const attachments = message.attachments.filter(a => a.content_type?.startsWith("image/") && !a.spoiler);
                if (!text && !stickerItems.length && !attachments.length) {
                    sendBotMessage(channel.id, { author: helsea, content: "That message has nothing to quote." });
                    return;
                }

                const { author } = message;
                const guildId = ChannelStore.getChannel(message.channel_id)?.guild_id;
                try {
                    const id = generateId();
                    const member = guildId ? GuildMemberStore.getMember(guildId, author.id) : null;
                    const profile = message.webhookId ? undefined : await fetchUserProfile(author.id, guildId ? { guild_id: guildId } : undefined)
                        .catch(() => { FluxDispatcher.dispatch({ type: "USER_PROFILE_FETCH_FAILURE", userId: author.id }); });
                    const serverProfile = guildId ? UserProfileStore.getGuildMemberProfile(author.id, guildId) : null;
                    const [avatar, serverAvatar, banner, serverBanner, emojis, stickers, images] = await Promise.all([
                        loadImage(IconUtils.getUserAvatarURL(author, false, 512)),
                        loadOptional(guildId && member?.avatar && IconUtils.getGuildMemberAvatarURLSimple({ guildId, userId: author.id, avatar: member.avatar, size: 512 })),
                        loadOptional(profile?.banner && IconUtils.getUserBannerURL({ id: author.id, banner: profile.banner, canAnimate: false, size: 1024 })),
                        loadOptional(guildId && serverProfile?.banner && IconUtils.getGuildMemberBannerURL({ id: author.id, guildId, banner: serverProfile.banner, canAnimate: false, size: 1024 })),
                        Promise.all(emojiRefs.map(async e => ({ name: e.name, image: await loadOptional(IconUtils.getEmojiURL({ id: e.id, animated: false, size: 96 })) }))),
                        loadAll(stickerItems.map(stickerURL)),
                        loadAll(attachments.slice(0, 4).map(imageURL))
                    ]);
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
                            font: findOption(args, "font", "mplus"),
                            bold: false,
                            italic: false,
                            light: false,
                            color: false,
                            flip: false,
                            vertical: false,
                            server: false,
                            banner: false,
                            effect: "glass",
                            emojis: false,
                            stickers: !text,
                            images: !text,
                            credit: false,
                            place: "below"
                        }
                    });
                    sendBotMessage(channel.id, { id, author: helsea, content: "" });
                } catch {
                    sendBotMessage(channel.id, { author: helsea, content: "Couldn't load the avatar for this quote." });
                }
            }
        }
    ]
});
