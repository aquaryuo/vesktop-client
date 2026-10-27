import * as DataStore from "@api/DataStore";
import { ContextMenuApi, Menu, React, useEffect, useLayoutEffect, useState } from "@webpack/common";
import type { MouseEvent as ReactMouseEvent } from "react";

import { settings, useParentClass } from ".";

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
let brush: string[] = [];
let filter = "";
let scope: Set<string> | null = null;
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

function applyTags(url: string, tags: string[]) {
    const current = data.gifs[url] ?? [];
    const next = tags.every(tag => current.includes(tag)) ? current.filter(tag => !tags.includes(tag)) : [...new Set([...current, ...tags])];
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
    brush = brush.filter(tag => tag !== id);
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
        if (brush.length && gif.url) applyTags(gif.url, brush);
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
    const selected = editing && brush.length > 0 && brush.every(tag => has(gif, tag));
    const names = editing ? allTags().filter(tag => has(gif, tag.id)).map(tag => tag.name).join(", ") : "";
    return {
        "data-vc-ei-spoiler": has(gif, SPOILER) || undefined,
        "data-vc-ei-armed": (!!armed && armed === gif?.url) || undefined,
        "data-vc-ei-brush": selected || undefined,
        "data-vc-ei-tags": names || undefined
    };
}

export function gifContent(gif: Gif & { url: string; }) {
    return has(gif, SPOILER) ? `||${gif.url}||` : gif.url;
}

export function filterGifs<T extends Gif>(list: T[]) {
    if (editing) return scope ? list.filter(gif => !!gif.url && scope!.has(gif.url)) : list;
    return filter ? list.filter(gif => has(gif, filter)) : list;
}

function toggleEditing() {
    editing = !editing;
    brush = [];
    const tagged = editing && filter ? Object.keys(data.gifs).filter(url => data.gifs[url].includes(filter)) : [];
    scope = tagged.length ? new Set(tagged) : null;
    disarm();
    refresh();
}

function TagEmpty({ name, searching }: { name: string; searching: boolean; }) {
    return (
        <div className="vc-ei-empty" role="status">
            <strong>{searching ? `No GIFs tagged ${name} match your search` : `No GIFs tagged ${name} yet`}</strong>
            <span>{searching ? "Try another search, or show all your favorites." : `Click Edit, pick ${name}, then click the GIFs you want to tag.`}</span>
            <button type="button" className="vc-ei-button" onClick={() => { filter = ""; refresh(); }}>Show all favorites</button>
        </div>
    );
}

export function tagEmpty(query?: string) {
    if (!filter || editing) return null;
    const name = allTags().find(tag => tag.id === filter)?.name;
    return name ? <TagEmpty name={name} searching={!!query} /> : null;
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
    brush = [];
    scope = null;
    filter = armed = renaming = "";
}

export function stopGifs() {
    clearTimeout(armTimer);
    items.clear();
    picker = null;
    editing = false;
    brush = [];
    scope = null;
    filter = armed = renaming = "";
}

let renaming = "";

function RenameTag({ tag }: { tag: Tag; }) {
    const [value, setValue] = useState(tag.name);
    const finish = (save: boolean) => {
        if (save) renameTag(tag.id, value);
        renaming = "";
        refresh();
    };
    return (
        <input
            className="vc-ei-input vc-ei-tag-input"
            value={value}
            maxLength={MAX_NAME}
            autoFocus
            aria-label={`Rename ${tag.name}`}
            onChange={e => setValue(e.currentTarget.value)}
            onBlur={() => finish(true)}
            onKeyDown={e => {
                e.stopPropagation();
                if (e.key === "Enter") finish(true);
                if (e.key === "Escape") finish(false);
            }}
        />
    );
}

function openTagMenu(e: ReactMouseEvent, tag: Tag) {
    const builtIn = tag.id === SPOILER;
    const entries = [
        !editing && <Menu.MenuItem key="filter" id="vc-ei-tag-filter" label={filter === tag.id ? "Show all favorites" : "Show GIFs with this tag"} action={() => { filter = filter === tag.id ? "" : tag.id; refresh(); }} />,
        !builtIn && <Menu.MenuItem key="rename" id="vc-ei-tag-rename" label="Rename tag" action={() => { renaming = tag.id; refresh(); }} />,
        !builtIn && <Menu.MenuItem key="delete" id="vc-ei-tag-delete" label="Delete tag" color="danger" action={() => deleteTag(tag.id)} />
    ].filter(Boolean);
    if (!entries.length) return;
    ContextMenuApi.openContextMenu(e, () => (
        <Menu.Menu navId="vc-ei-tag" onClose={ContextMenuApi.closeContextMenu} aria-label={tag.name}>
            {entries}
        </Menu.Menu>
    ));
}

function TagChip({ tag }: { tag: Tag; }) {
    if (renaming === tag.id) return <RenameTag tag={tag} />;
    const pressed = editing ? brush.includes(tag.id) : filter === tag.id;
    return (
        <button
            type="button"
            className="vc-ei-choice"
            aria-pressed={pressed}
            title={tag.id === SPOILER ? "Spoiler GIFs are sent as spoilers" : "Right-click to rename or delete"}
            onClick={() => {
                if (editing) brush = brush.includes(tag.id) ? brush.filter(id => id !== tag.id) : [...brush, tag.id];
                else filter = filter === tag.id ? "" : tag.id;
                refresh();
            }}
            onContextMenu={e => openTagMenu(e, tag)}
        >
            {tag.name}
        </button>
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

export function GifTools({ count }: { count: number; }) {
    useTags();
    const ref = useParentClass<HTMLDivElement>("vc-ei-gifhead");
    useLayoutEffect(() => {
        const drawer = ref.current?.closest(".vc-ei");
        drawer?.toggleAttribute("data-vc-ei-editing", editing);
        return () => drawer?.removeAttribute("data-vc-ei-editing");
    }, [editing]);
    const tags = allTags();
    const names = tags.filter(tag => brush.includes(tag.id)).map(tag => tag.name);
    const brushName = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
    const scopeName = scope && tags.find(tag => tag.id === filter)?.name;
    const hint = brushName ? `Click GIFs to add or remove ${brushName}.` : "Pick one or more tags, then click GIFs to tag them.";
    return (
        <div className="vc-ei-giftools" ref={ref} data-vc-ei-editing={editing || undefined}>
            <div className="vc-ei-chips" role="group" aria-label={editing ? "Tags to apply, pick one or more" : "Filter favorites by tag"}>
                {!editing && <button type="button" className="vc-ei-choice" aria-pressed={!filter} aria-label={`All, ${count} favorite GIFs`} onClick={() => { filter = ""; refresh(); }}>All<span className="vc-ei-count">{count}</span></button>}
                {tags.map(tag => <TagChip key={tag.id} tag={tag} />)}
                {editing && <NewTag />}
                <button type="button" className="vc-ei-choice vc-ei-edit" aria-pressed={editing} onClick={toggleEditing}>{editing ? "Done" : "Edit"}</button>
            </div>
            {editing && <p className="vc-ei-hint" role="status">{scopeName ? `Editing GIFs tagged ${scopeName}. ${hint}` : hint}</p>}
        </div>
    );
}
