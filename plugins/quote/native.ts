import { createHash } from "crypto";
import { app, IpcMainInvokeEvent, net } from "electron";
import { mkdir, readFile, stat, writeFile } from "fs/promises";
import { join } from "path";

const DIR = join(app.getPath("userData"), "QuoteFonts");
const ALLOWED = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;
const STYLESHEET = /^https:\/\/fonts\.googleapis\.com\//;
const WEEK = 7 * 24 * 60 * 60 * 1000;

export async function getFont(_: IpcMainInvokeEvent, url: string) {
    if (typeof url !== "string" || !ALLOWED.test(url)) throw new Error("Not a Google Fonts URL");
    const file = join(DIR, createHash("sha256").update(url).digest("hex"));
    const saved = await stat(file).catch(() => null);
    if (saved && !(STYLESHEET.test(url) && Date.now() - saved.mtimeMs > WEEK)) return readFile(file);
    try {
        const res = await net.fetch(url, { headers: { "User-Agent": app.userAgentFallback } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = Buffer.from(await res.arrayBuffer());
        await mkdir(DIR, { recursive: true });
        await writeFile(file, data);
        return data;
    } catch (e) {
        if (saved) return readFile(file);
        throw e;
    }
}
