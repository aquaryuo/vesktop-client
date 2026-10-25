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
    { alias: "glass", name: "Glass", filter: "none", tint: 0.25 },
    { alias: "blur", name: "Blur", filter: "blur(24px)", tint: 0.5 },
    { alias: "dim", name: "Dim", filter: "none", tint: 0.6 },
    { alias: "mono", name: "Mono", filter: "grayscale(1)", tint: 0.55 },
];

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
}

export interface QuoteContent {
    avatar: ImageBitmap;
    serverAvatar?: ImageBitmap;
    banner?: ImageBitmap;
    serverBanner?: ImageBitmap;
    text: string;
    name: string;
    username: string;
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

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
    const fits = (s: string) => ctx.measureText(s).width <= maxWidth;
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

    await loadFonts();
    const sample = content.text + content.name + content.username + "“”-@";
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
    const maxWidth = area.w - pad * 2;
    const nameSize = style.vertical ? 30 : 28;
    const userSize = style.vertical ? 20 : 18;
    const marksSize = 56;
    const footer = (style.vertical ? 32 : 0) + nameSize * 1.4 + userSize * 1.4;
    const header = style.vertical ? marksSize * 1.2 : 0;
    const maxTextHeight = area.h - pad * 2 - footer - header - 24;

    let size = style.vertical ? 56 : 52;
    let lines: string[];
    for (; ; size -= 2) {
        ctx.font = fontSpec(family, size, style.bold, style.italic);
        lines = wrap(ctx, content.text, maxWidth);
        if (lines.length * size * 1.3 <= maxTextHeight || size <= 18) break;
    }
    const maxLines = Math.max(1, Math.floor(maxTextHeight / (size * 1.3)));
    if (lines.length > maxLines) {
        lines = lines.slice(0, maxLines);
        lines[maxLines - 1] = lines[maxLines - 1].replace(/.?$/u, "…");
    }

    const textHeight = lines.length * size * 1.3;
    const centerX = area.x + area.w / 2;
    let y = area.y + (area.h - (header + textHeight + 24 + footer)) / 2;
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
    for (const line of lines) {
        ctx.fillText(line, centerX, y + size * 0.15);
        y += size * 1.3;
    }
    y += 24;

    if (style.vertical) {
        ctx.fillRect(centerX - width * 0.22, y, width * 0.44, 2);
        y += 32;
    }

    ctx.font = fontSpec(family, nameSize, false, true);
    ctx.fillText("- " + content.name, centerX, y);
    y += nameSize * 1.4;
    ctx.fillStyle = sub;
    ctx.font = fontSpec(family, userSize, false, false);
    ctx.fillText("@" + content.username, centerX, y);

    return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("Quote render failed")), "image/png"));
}
