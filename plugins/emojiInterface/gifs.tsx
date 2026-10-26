import * as DataStore from "@api/DataStore";
import { React, useEffect, useState } from "@webpack/common";

import { settings } from ".";

interface Tag {
    id: string;
    name: string;
}

interface TagData {
    tags: Tag[];
    gifs: Record<string, string[]>;
}

interface Gif {
    url?: string;
}

interface Updatable {
    forceUpdate(): void;
    props: { item?: Gif; };
}

const KEY = "EmojiInterface_gifTags";
const SPOILER = "spoiler";
const ARM_MS = 4000;
const MAX_NAME = 24;

let data: TagData = { tags: [], gifs: {} };
let loaded: Promise<void> | undefined;
let editing = false;
let brush = "";
let filter = "";
let armed = "";
let armTimer: ReturnType<typeof setTimeout> | undefined;
let picker: { forceUpdate(): void; } | null = null;
let version = 0;
const items = new Set<Updatable>();
const listeners = new Set<() => void>();

const allTags = (): Tag[] => [{ id: SPOILER, name: "Spoiler" }, ...data.tags];
const has = (gif: Gif | undefined, tag: string) => !!gif?.url && !!data.gifs[gif.url]?.includes(tag);

function refresh() {
    version++;
    items.forEach(item => item.forceUpdate());
    picker?.forceUpdate();
    listeners.forEach(listener => listener());
}

function loadTags() {
    return loaded ??= DataStore.get<TagData>(KEY).then(saved => {
        if (saved && Array.isArray(saved.tags) && saved.gifs && typeof saved.gifs === "object") data = saved;
        refresh();
    });
}

function persist() {
    refresh();
    DataStore.set(KEY, data);
}

function useTags() {
    useEffect(() => { loadTags(); }, []);
    return React.useSyncExternalStore(listener => {
        listeners.add(listener);
        return () => { listeners.delete(listener); };
    }, () => version);
}

function toggleTag(url: string, tag: string) {
    const current = data.gifs[url] ?? [];
    const next = current.includes(tag) ? current.filter(t => t !== tag) : [...current, tag];
    const gifs = { ...data.gifs };
    if (next.length) gifs[url] = next;
    else delete gifs[url];
    data = { ...data, gifs };
    persist();
}

function cleanName(name: string) {
    return name.trim().replace(/\s+/g, " ").slice(0, MAX_NAME);
}

function nameTaken(name: string, except?: string) {
    return allTags().some(tag => tag.id !== except && tag.name.toLowerCase() === name.toLowerCase());
}

function createTag(name: string) {
    const clean = cleanName(name);
    if (!clean || nameTaken(clean)) return false;
    const id = `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    data = { ...data, tags: [...data.tags, { id, name: clean }] };
    brush = id;
    persist();
    return true;
}

function renameTag(id: string, name: string) {
    const clean = cleanName(name);
    if (!clean || nameTaken(clean, id)) return false;
    data = { ...data, tags: data.tags.map(tag => tag.id === id ? { ...tag, name: clean } : tag) };
    persist();
    return true;
}

function deleteTag(id: string) {
    const gifs: Record<string, string[]> = {};
    for (const [url, tags] of Object.entries(data.gifs)) {
        const next = tags.filter(t => t !== id);
        if (next.length) gifs[url] = next;
    }
    data = { tags: data.tags.filter(tag => tag.id !== id), gifs };
    if (brush === id) brush = "";
    if (filter === id) filter = "";
    persist();
}

function disarm() {
    clearTimeout(armTimer);
    if (!armed) return;
    armed = "";
    refresh();
}

function arm(url: string) {
    clearTimeout(armTimer);
    armed = url;
    armTimer = setTimeout(disarm, ARM_MS);
    refresh();
}

export function allowGif(gif: Gif, extra?: { shiftKey?: boolean; }) {
    if (editing) {
        if (brush && gif.url) toggleTag(gif.url, brush);
        return false;
    }
    if (extra?.shiftKey || !settings.store.gifGuard || !gif.url) return true;
    if (armed === gif.url) {
        disarm();
        return true;
    }
    arm(gif.url);
    return false;
}

export function gifFlags(gif?: Gif) {
    return {
        "data-vc-ei-spoiler": has(gif, SPOILER) || undefined,
        "data-vc-ei-armed": (!!armed && armed === gif?.url) || undefined,
        "data-vc-ei-brush": (editing && !!brush && has(gif, brush)) || undefined
    };
}

export function gifContent(gif: Gif & { url: string; }) {
    return has(gif, SPOILER) ? `||${gif.url}||` : gif.url;
}

export function filterGifs<T extends Gif>(list: T[]) {
    return filter ? list.filter(gif => has(gif, filter)) : list;
}

export function trackGif(item: Updatable) {
    items.add(item);
    loadTags();
}

export function untrackGif(item: Updatable) {
    items.delete(item);
}

export function pickerMounted(instance: { forceUpdate(): void; }) {
    picker = instance;
    loadTags();
}

export function pickerGone(instance: { forceUpdate(): void; }) {
    if (picker !== instance) return;
    clearTimeout(armTimer);
    picker = null;
    editing = false;
    brush = filter = armed = "";
}

export function stopGifs() {
    clearTimeout(armTimer);
    items.clear();
    picker = null;
    editing = false;
    brush = filter = armed = "";
}

function EditableTag({ tag }: { tag: Tag; }) {
    const [renaming, setRenaming] = useState(false);
    const [value, setValue] = useState(tag.name);
    const [confirm, setConfirm] = useState(false);
    const builtIn = tag.id === SPOILER;

    if (renaming) {
        const commit = () => {
            if (!renameTag(tag.id, value)) setValue(tag.name);
            setRenaming(false);
        };
        return (
            <input
                className="vc-ei-input vc-ei-tag-input"
                value={value}
                maxLength={MAX_NAME}
                autoFocus
                aria-label={`Rename ${tag.name}`}
                onChange={e => setValue(e.currentTarget.value)}
                onBlur={commit}
                onKeyDown={e => {
                    e.stopPropagation();
                    if (e.key === "Enter") commit();
                    if (e.key === "Escape") {
                        setValue(tag.name);
                        setRenaming(false);
                    }
                }}
            />
        );
    }

    return (
        <span className="vc-ei-tag" onMouseLeave={() => setConfirm(false)}>
            <button
                type="button"
                className="vc-ei-choice"
                aria-pressed={brush === tag.id}
                title={builtIn ? "Spoiler tags send the GIF as a spoiler" : "Click to apply, double-click to rename"}
                onClick={() => { brush = brush === tag.id ? "" : tag.id; refresh(); }}
                onDoubleClick={() => { if (!builtIn) { setValue(tag.name); setRenaming(true); } }}
            >
                {tag.name}
            </button>
            {!builtIn && (
                <button type="button" className="vc-ei-tag-delete" aria-label={confirm ? `Confirm deleting ${tag.name}` : `Delete ${tag.name}`} onClick={() => confirm ? deleteTag(tag.id) : setConfirm(true)}>
                    {confirm ? "Delete?" : "×"}
                </button>
            )}
        </span>
    );
}

function NewTag() {
    const [value, setValue] = useState("");
    const [error, setError] = useState(false);
    const add = () => {
        if (!value.trim()) return;
        if (createTag(value)) setValue("");
        else setError(true);
    };
    return (
        <span className="vc-ei-tag">
            <input
                className="vc-ei-input vc-ei-tag-input"
                placeholder="New tag"
                value={value}
                maxLength={MAX_NAME}
                aria-label="New tag name"
                aria-invalid={error}
                onChange={e => { setValue(e.currentTarget.value); setError(false); }}
                onKeyDown={e => {
                    e.stopPropagation();
                    if (e.key === "Enter") add();
                }}
            />
            <button type="button" className="vc-ei-choice" disabled={!value.trim()} onClick={add}>Add</button>
        </span>
    );
}

export function GifTools() {
    useTags();
    const tags = allTags();
    const brushName = tags.find(tag => tag.id === brush)?.name;
    return (
        <div className="vc-ei-giftools" data-vc-ei-editing={editing || undefined}>
            <div className="vc-ei-chips" role="group" aria-label={editing ? "Tags, pick one to apply" : "Filter favorites by tag"}>
                {editing
                    ? <>{tags.map(tag => <EditableTag key={tag.id} tag={tag} />)}<NewTag /></>
                    : <>
                        <button type="button" className="vc-ei-choice" aria-pressed={!filter} onClick={() => { filter = ""; refresh(); }}>All</button>
                        {tags.map(tag => (
                            <button key={tag.id} type="button" className="vc-ei-choice" aria-pressed={filter === tag.id} onClick={() => { filter = filter === tag.id ? "" : tag.id; refresh(); }}>{tag.name}</button>
                        ))}
                    </>}
            </div>
            <button type="button" className="vc-ei-choice vc-ei-edit" aria-pressed={editing} onClick={() => { editing = !editing; brush = ""; disarm(); refresh(); }}>{editing ? "Done" : "Edit"}</button>
            {editing && <p className="vc-ei-hint" role="status">{brushName ? `Click GIFs to add or remove ${brushName}.` : "Pick a tag, then click GIFs to tag them."}</p>}
        </div>
    );
}
