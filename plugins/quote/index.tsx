import { ApplicationCommandInputType, ApplicationCommandOptionType, findOption, generateId, sendBotMessage } from "@api/Commands";
import ErrorBoundary from "@components/ErrorBoundary";
import { classes } from "@utils/misc";
import definePlugin from "@utils/types";
import type { Message } from "@vencord/discord-types";
import { ChannelStore, Constants, FluxDispatcher, GuildMemberStore, IconUtils, MessageStore, PendingReplyStore, RestAPI, showToast, UploadHandler, UserStore, useEffect, useRef, useState } from "@webpack/common";

import { FONTS, loadFonts, QuoteContent, QuoteStyle, renderQuote, unloadFonts } from "./draw";
import managedStyle from "./styles.css?managed";

interface Quote {
    content: QuoteContent;
    style: QuoteStyle;
}

const quotes = new Map<string, Quote>();

const TOGGLES: [keyof QuoteStyle, string, string][] = [
    ["light", "☀", "Light background"],
    ["color", "🎨", "Colour avatar"],
    ["flip", "🔄", "Swap sides"],
    ["bold", "B", "Bold"],
    ["italic", "I", "Italic"],
    ["vertical", "NEW", "Tall layout"],
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

function cleanText(content: string) {
    return content
        .replace(/<a?:(\w+):\d+>/g, ":$1:")
        .replace(/<@!?(\d+)>/g, (_, id) => "@" + (UserStore.getUser(id)?.username ?? "unknown"))
        .replace(/<#(\d+)>/g, (_, id) => "#" + (ChannelStore.getChannel(id)?.name ?? "channel"))
        .replace(/<@&\d+>/g, "@role")
        .trim();
}

async function loadAvatar(url: string) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Avatar request failed with ${res.status}`);
    return createImageBitmap(await res.blob());
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

    const copy = () => {
        if (!blob.current) return;
        navigator.clipboard.write([new ClipboardItem({ "image/png": blob.current })])
            .then(() => showToast({ text: "Quote copied", variant: "success" }))
            .catch(() => showToast({ text: "Couldn't copy the quote", variant: "critical" }));
    };

    return (
        <div className={classes("vc-quote", style.vertical && "vc-quote-vertical")}>
            {url && <img className="vc-quote-image" src={url} alt={`Quote of ${quote.content.name}: ${quote.content.text}`} />}
            <div className="vc-quote-row">
                {TOGGLES.map(([key, label, title]) => (
                    <button
                        key={key}
                        type="button"
                        title={title}
                        aria-label={title}
                        aria-pressed={!!style[key]}
                        className={classes("vc-quote-button", style[key] && "vc-quote-active")}
                        onClick={() => setStyle({ ...style, [key]: !style[key] })}
                    >
                        {label}
                    </button>
                ))}
            </div>
            <select
                className="vc-quote-select"
                aria-label="Font"
                value={style.font}
                onChange={e => setStyle({ ...style, font: e.currentTarget.value })}
            >
                {FONTS.map(f => <option key={f.alias} value={f.alias}>{`${f.family} (${f.alias})`}</option>)}
            </select>
            <div className="vc-quote-row">
                <button type="button" className="vc-quote-button" onClick={send}>Send</button>
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

                const message = ref ? await findMessage(ref, channel.id) : reply?.message;
                if (!message) {
                    sendBotMessage(channel.id, { content: ref ? "Couldn't find that message." : "Reply to a message, or give a message ID or link." });
                    return;
                }

                const text = cleanText(message.content);
                if (!text) {
                    sendBotMessage(channel.id, { content: "That message has no text to quote." });
                    return;
                }

                const { author } = message;
                const guildId = ChannelStore.getChannel(message.channel_id)?.guild_id;
                try {
                    const id = generateId();
                    quotes.set(id, {
                        content: {
                            avatar: await loadAvatar(IconUtils.getUserAvatarURL(author, false, 512)),
                            text,
                            name: (guildId && GuildMemberStore.getNick(guildId, author.id)) || author.globalName || author.username,
                            username: author.username
                        },
                        style: { font: findOption(args, "font", "mplus"), bold: false, italic: false, light: false, color: false, flip: false, vertical: false }
                    });
                    sendBotMessage(channel.id, { id, content: "" });
                } catch {
                    sendBotMessage(channel.id, { content: "Couldn't load the avatar for this quote." });
                }
            }
        }
    ]
});
