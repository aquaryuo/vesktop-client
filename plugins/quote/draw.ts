export const FONTS = [
    { alias: "mplus", family: "M PLUS Rounded 1c", axes: "wght@400;700" },
    { alias: "dela", family: "Dela Gothic One" },
    { alias: "dot", family: "DotGothic16" },
    { alias: "pop", family: "Hachi Maru Pop" },
    { alias: "rampart", family: "Rampart One" },
    { alias: "reggae", family: "Reggae One" },
    { alias: "rocknroll", family: "RocknRoll One" },
    { alias: "serif", family: "Zen Old Mincho", axes: "wght@400;700" },
    { alias: "yuji", family: "Yuji Syuku" },
    { alias: "yusei", family: "Yusei Magic" },
    { alias: "inconsolata", family: "Inconsolata", axes: "wght@400;700" },
    { alias: "exo2", family: "Exo 2", axes: "ital,wght@0,400;0,700;1,400;1,700" },
    { alias: "bruno", family: "Bruno Ace SC" },
    { alias: "castoro", family: "Castoro Titling" },
    { alias: "poltawski", family: "Poltawski Nowy", axes: "ital,wght@0,400;0,700;1,400;1,700" },
    { alias: "vina", family: "Vina Sans" },
    { alias: "script", family: "Dancing Script", axes: "wght@400;700" },
];

export const EFFECTS = [
    { alias: "glass", name: "Glass", filter: "none", tint: 0.25, icon: "M6 3h12l4 6-10 13L2 9ZM11 3 8 9l4 13 4-13-3-6M2 9h20" },
    { alias: "blur", name: "Blur", filter: "blur(24px)", tint: 0.5, icon: "M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" },
    { alias: "dim", name: "Dim", filter: "none", tint: 0.6, icon: "M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" },
    { alias: "mono", name: "Mono", filter: "grayscale(1)", tint: 0.55, icon: "M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0M12 18a6 6 0 0 0 0-12v12z" },
];

export const PLACES = [
    { alias: "below", name: "Below", icon: "M12 5v14M19 12l-7 7-7-7" },
    { alias: "top", name: "Top", icon: "M5 3h14M18 13l-6-6-6 6M12 7v14" },
    { alias: "bottom", name: "Bottom", icon: "M12 17V3M6 11l6 6 6-6M19 21H5" },
];

export const EMOJI_BASE = 0xE000;
const EMOJI = /[\uE000-\uF8FF]/g;

export interface QuoteStyle {
    font: string;
    bold: boolean;
    italic: boolean;
    light: boolean;
    color: boolean;
    flip: boolean;
    vertical: boolean;
    server: boolean;
    banner: boolean;
    effect: string;
    emojis: boolean;
    stickers: boolean;
    images: boolean;
    credit: boolean;
    place: string;
}

export interface QuoteContent {
    avatar: ImageBitmap;
    serverAvatar?: ImageBitmap;
    banner?: ImageBitmap;
    serverBanner?: ImageBitmap;
    text: string;
    emojis: { name: string; image?: ImageBitmap; }[];
    stickers: ImageBitmap[];
    images: ImageBitmap[];
    name: string;
    username: string;
    quoter: string;
}

const FONTS_URL = "https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@600&" + FONTS
    .map(f => "family=" + f.family.replaceAll(" ", "+") + (f.axes ? ":" + f.axes : ""))
    .join("&") + "&display=swap";

let fontsReady: Promise<void> | undefined;

export function loadFonts() {
    return fontsReady ??= new Promise(resolve => {
        const link = document.createElement("link");
        link.id = "vc-quote-fonts";
        link.rel = "stylesheet";
        link.href = FONTS_URL;
        link.onload = link.onerror = () => resolve();
        document.head.append(link);
    });
}

export function unloadFonts() {
    document.getElementById("vc-quote-fonts")?.remove();
    fontsReady = undefined;
}

function fontSpec(family: string, size: number, bold: boolean, italic: boolean) {
    return `${italic ? "italic " : ""}${bold ? 700 : 400} ${size}px "${family}", "M PLUS Rounded 1c", sans-serif`;
}

function cover(ctx: CanvasRenderingContext2D, image: ImageBitmap, x: number, y: number, w: number, h: number) {
    const scale = Math.max(w / image.width, h / image.height);
    ctx.drawImage(image, x + (w - image.width * scale) / 2, y + (h - image.height * scale) / 2, image.width * scale, image.height * scale);
}

function wrap(text: string, maxWidth: number, measure: (s: string) => number) {
    const fits = (s: string) => measure(s) <= maxWidth;
    const lines: string[] = [];
    for (const paragraph of text.split("\n")) {
        let line = "";
        for (const token of paragraph.split(/(\s+)/)) {
            if (!token || fits(line + token)) {
                line += token;
                continue;
            }
            if (line.trim()) lines.push(line.trimEnd());
            let chars = [...token.trimStart()];
            while (chars.length && !fits(chars.join(""))) {
                let n = chars.length - 1;
                while (n > 1 && !fits(chars.slice(0, n).join(""))) n--;
                lines.push(chars.slice(0, n).join(""));
                chars = chars.slice(n);
            }
            line = chars.join("");
        }
        lines.push(line.trimEnd());
    }
    return lines;
}

export async function renderQuote(content: QuoteContent, style: QuoteStyle): Promise<Blob> {
    const family = (FONTS.find(f => f.alias === style.font) ?? FONTS[0]).family;
    const [width, height] = style.vertical ? [720, 1280] : [1200, 630];
    const side = style.vertical ? width : height;
    const avatar = style.server && content.serverAvatar || content.avatar;
    const banner = style.banner ? style.server && content.serverBanner || content.banner : undefined;
    const effect = EFFECTS.find(e => e.alias === style.effect) ?? EFFECTS[0];
    const bg = style.light ? "#ffffff" : "#000000";
    const fg = style.light ? "#000000" : "#ffffff";
    const sub = banner ? fg + "b8" : style.light ? "#6b6b6b" : "#8a8a8a";

    const text = content.text.replace(EMOJI, c => {
        const emoji = content.emojis[c.charCodeAt(0) - EMOJI_BASE];
        return style.emojis && emoji.image ? c : `:${emoji.name}:`;
    }).trim();
    const credit = "Quoted by @" + content.quoter;

    await loadFonts();
    const sample = text + content.name + content.username + credit + "“”-";
    await Promise.all([
        document.fonts.load(fontSpec(family, 40, style.bold, style.italic), sample),
        document.fonts.load(fontSpec(family, 40, false, true), sample)
    ]);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
    if (banner) {
        ctx.filter = effect.filter;
        cover(ctx, banner, -48, -48, width + 96, height + 96);
        ctx.filter = "none";
        ctx.globalAlpha = effect.tint;
        ctx.fillRect(0, 0, width, height);
        ctx.globalAlpha = 1;
    }

    const avatarX = style.vertical ? 0 : style.flip ? width - side : 0;
    const avatarY = style.vertical && style.flip ? height - side : 0;
    const fadeStart = side * 0.45;
    const layer = document.createElement("canvas");
    layer.width = layer.height = side;
    const layerCtx = layer.getContext("2d")!;
    layerCtx.filter = style.color ? "none" : "grayscale(1)";
    layerCtx.drawImage(avatar, 0, 0, side, side);
    layerCtx.filter = "none";
    const fade = style.vertical
        ? style.flip
            ? layerCtx.createLinearGradient(0, side - fadeStart, 0, 0)
            : layerCtx.createLinearGradient(0, fadeStart, 0, side)
        : style.flip
            ? layerCtx.createLinearGradient(side - fadeStart, 0, 0, 0)
            : layerCtx.createLinearGradient(fadeStart, 0, side, 0);
    fade.addColorStop(0, "#000000");
    fade.addColorStop(1, "#00000000");
    layerCtx.globalCompositeOperation = "destination-in";
    layerCtx.fillStyle = fade;
    layerCtx.fillRect(0, 0, side, side);
    ctx.drawImage(layer, avatarX, avatarY);

    const area = style.vertical
        ? { x: 0, y: style.flip ? 0 : side, w: width, h: height - side }
        : { x: style.flip ? 0 : side, y: 0, w: width - side, h: height };

    if (banner && effect.alias === "glass") {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(area.x + 24, area.y + 24, area.w - 48, area.h - 48, 24);
        ctx.clip();
        ctx.filter = "blur(24px)";
        cover(ctx, banner, -48, -48, width + 96, height + 96);
        ctx.filter = "none";
        ctx.globalAlpha = 0.45;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
        ctx.strokeStyle = fg + "2e";
        ctx.stroke();
    }
    const pad = 48;
    const gap = 24;
    const inner = { x: area.x + pad, y: area.y + pad, w: area.w - pad * 2, h: area.h - pad * 2 };
    const nameSize = style.vertical ? 30 : 28;
    const userSize = style.vertical ? 20 : 18;
    const marksSize = 56;
    const rule = style.vertical ? 32 : 0;
    const footer = rule + nameSize * 1.4 + userSize * 1.4 * (style.credit ? 2 : 1);
    const header = style.vertical ? marksSize * 1.2 : 0;
    const room = inner.h - footer - gap - header;

    const media = [...style.stickers ? content.stickers : [], ...style.images ? content.images : []];
    const ratio = media.reduce((sum, m) => sum + m.width / m.height, 0);
    const textRoom = media.length ? room * 0.6 - gap : room;
    const jumbo = !text.replace(EMOJI, "").replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\p{Join_Control}\p{Variation_Selector}\s]/gu, "");

    let size = jumbo ? 160 : style.vertical ? 56 : 52;
    const measure = (s: string) => ctx.measureText(s.replace(EMOJI, "")).width + (s.match(EMOJI)?.length ?? 0) * size * 1.2;
    let lines: string[] = [];
    while (text) {
        ctx.font = fontSpec(family, size, style.bold, style.italic);
        lines = wrap(text, inner.w, measure);
        if (lines.length * size * 1.3 <= textRoom || size <= 18) break;
        size -= 2;
    }
    const maxLines = Math.max(1, Math.floor(textRoom / (size * 1.3)));
    if (lines.length > maxLines) {
        lines = lines.slice(0, maxLines);
        lines[maxLines - 1] = lines[maxLines - 1].replace(/.?$/u, "…");
    }

    const textHeight = lines.length * size * 1.3;
    const mediaHeight = media.length ? Math.min(room - textHeight - (text ? gap : 0), (inner.w - gap * (media.length - 1)) / ratio) : 0;
    const body = header + textHeight + (text && media.length ? gap : 0) + mediaHeight;
    const top = style.place === "top" ? inner.y + footer + gap : inner.y;
    const bottom = style.place === "top" ? inner.y + inner.h : inner.y + inner.h - footer - gap;
    const start = Math.max(top, Math.min(inner.y + (inner.h - body) / 2, bottom - body));
    const centerX = area.x + area.w / 2;
    let y = start;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = fg;
    if (banner) {
        ctx.shadowColor = bg + "99";
        ctx.shadowBlur = 16;
    }

    if (style.vertical) {
        ctx.font = fontSpec(family, marksSize, true, true);
        ctx.fillText("“ ”", centerX, y);
        y += header;
    }

    ctx.font = fontSpec(family, size, style.bold, style.italic);
    ctx.textAlign = "left";
    for (const line of lines) {
        let x = centerX - measure(line) / 2;
        line.split(/([\uE000-\uF8FF])/).forEach((part, i) => {
            if (i % 2) {
                ctx.drawImage(content.emojis[part.charCodeAt(0) - EMOJI_BASE].image!, x + size * 0.05, y + size * 0.1, size * 1.1, size * 1.1);
                x += size * 1.2;
            } else {
                ctx.fillText(part, x, y + size * 0.15);
                x += ctx.measureText(part).width;
            }
        });
        y += size * 1.3;
    }
    ctx.textAlign = "center";

    if (text && media.length) y += gap;
    let mediaX = centerX - (mediaHeight * ratio + gap * (media.length - 1)) / 2;
    for (const m of media) {
        const w = mediaHeight * m.width / m.height;
        ctx.drawImage(m, mediaX, y, w, mediaHeight);
        mediaX += w + gap;
    }

    let fy = style.place === "top" ? inner.y : style.place === "bottom" ? inner.y + inner.h - footer : start + body + gap;
    if (rule && style.place !== "top") {
        ctx.fillRect(centerX - width * 0.22, fy, width * 0.44, 2);
        fy += rule;
    }
    if (rule && style.place === "top") ctx.fillRect(centerX - width * 0.22, inner.y + footer - 2, width * 0.44, 2);

    ctx.font = fontSpec(family, nameSize, false, true);
    ctx.fillText("- " + content.name, centerX, fy);
    fy += nameSize * 1.4;
    ctx.fillStyle = sub;
    ctx.font = fontSpec(family, userSize, false, false);
    ctx.fillText("@" + content.username, centerX, fy);
    fy += userSize * 1.4;
    if (style.credit) ctx.fillText(credit, centerX, fy);

    return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("Quote render failed")), "image/png"));
}
