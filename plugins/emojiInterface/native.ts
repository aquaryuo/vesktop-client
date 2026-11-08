import { BrowserWindow, IpcMainInvokeEvent } from "electron";

export function setProgress(event: IpcMainInvokeEvent, value: number) {
    BrowserWindow.fromWebContents(event.sender)?.setProgressBar(Number.isFinite(value) ? value : -1);
}
