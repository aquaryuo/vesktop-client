# vesktop-client

My plugins for Vencord and Equicord:

- Quote: `/quote` on a reply, or `/quote-link` with a message link, draws the message as a quote image only you see. You can send, save or copy it.
- Emoji Interface: restyles the emoji, sticker and GIF picker, and adds resizing, GIF tags, a Downloads tab, hiding servers and categories, and moving favorites between accounts.
- MyCommands: gives these plugins' commands their own section in the command list.
- FakePing: right-click a message and pick Fake Ping to highlight it like a ping. Only you see it.
- Optimize This S\*\*t: makes Discord lighter and its menus faster without changing how it looks, and stops your avatar and banner from flicking back to old ones after you change them. An optional setting makes Settings and other dimmed windows smoother, with a plain dark backdrop behind them.

## Install

You need Vesktop, Equibop, or the Discord app with Vencord or Equicord, on Windows, macOS or Linux. Open it once, then quit it: right-click its tray icon and pick Quit, or press Cmd+Q on macOS.

On Windows, press the Windows key, type `PowerShell` and press Enter. Paste this with Ctrl+V and press Enter:

```powershell
irm https://raw.githubusercontent.com/aquaryuo/vesktop-client/main/install.ps1 | iex
```

On macOS or Linux, open Terminal, paste this and press Enter:

```bash
curl -fsSL https://raw.githubusercontent.com/aquaryuo/vesktop-client/main/install.sh | sh
```

Pick your apps with the arrow keys and Space, then press Enter. When it says `installed`, open the app, go to Settings (the cog at the bottom left), then Plugins under Vencord or Equicord, and turn on the ones you want. Updates install by themselves.

### Uninstall

Run one of these the same way. It shows the same list, so you can pick which apps to remove the plugins from.

```powershell
irm https://raw.githubusercontent.com/aquaryuo/vesktop-client/main/uninstall.ps1 | iex
```

```bash
curl -fsSL https://raw.githubusercontent.com/aquaryuo/vesktop-client/main/uninstall.sh | sh
```

It removes these plugins and Quote's font cache, puts back the build you had before, and undoes the Discord setup if the install script did one. Your settings and other plugins stay. Installs from before 2026-11-08 have no saved build, so they get the official Vencord or Equicord build.

<details>
<summary>How it works</summary>

The script swaps your Vencord or Equicord files for this repo's build, which is upstream Vencord or Equicord with these plugins added. Your settings, themes and other plugins stay. Config means `%APPDATA%` on Windows, `~/Library/Application Support` on macOS and `~/.config` on Linux.

| You use | It replaces | With |
|---|---|---|
| Vesktop | `Config/vesktop/sessionData/vencordFiles`, or the folder set as Vencord Location | the four `vencordDesktop*` files |
| Discord app with Vencord | `Config/Vencord/dist` | `patcher.js`, `preload.js`, `renderer.js` and `renderer.css` |
| Equibop | `Config/equibop/sessionData/equicord.asar` | `equibop.asar` |
| Discord app with Equicord | `Config/Equicord/equicord.asar` | `desktop.asar` |

- The first time, it saves each file it replaces next to it as `<file>.before-plugins`, which uninstall puts back.
- If Discord has a Vencord or Equicord folder but doesn't load it, the script runs Vencord's or Equicord's own installer for Discord first. If Discord loads another client, that folder is left alone.
- On Linux it also finds Flatpak installs of Vesktop and Equibop under `~/.var/app/<app id>/config`.
- A Vencord or Equicord you built yourself gets the plugins in its source instead (see [Built from source](#built-from-source)). Equibop set to any other custom Equicord folder is skipped.
- Vesktop always gets the Vencord build, since Equicord no longer makes one for Vesktop.
- Updates come from this repo through the Updater page in Vencord or Equicord settings. With automatic updates on, they install when the app starts.
- Repair in Vesktop's or Equibop's tray menu, or in the Vencord or Equicord installer, also removes the plugins, but puts back the official build instead of yours.

</details>

### Built from source

If you build Vencord or Equicord yourself, for example with [BetterVencord](https://github.com/Davilarek/BetterVencordPatchset), run the same command. It finds your build through the Discord app or the Vencord Location set in Vesktop or Equibop, and copies the plugins into the build's `src/userplugins` folder, plus the patchset's for BetterVencord, so your own rebuilds keep them. Then it runs `pnpm build` in the build's folder (`dist/Vencord` for BetterVencord) with the packages already installed there, so nothing else in your build changes. This needs pnpm and takes about a minute. If the build fails, your previous build is kept, and uninstall puts back your build from before the plugins. The plugins don't update by themselves in your own build, so run the command again to update them.

BetterVencord rebuilt with its own build script after 2026-11-04 gets `@zenfs/core` 2.9.0, which can't read the virtual filesystem older versions saved, so its settings disappear. Until BetterVencord pins it, change `"@zenfs/core": "^2.5.6"` to `"@zenfs/core": "2.8.3"` in `src/patch-package_json.patch` and rebuild.

To add them by hand:

1. Download this repo with Code > Download ZIP, or `git clone https://github.com/aquaryuo/vesktop-client`.
2. Copy `emojiInterface`, `fakePing`, `myCommands`, `optimizeThisShit` and `quote` from `plugins` into `src/userplugins` in your BetterVencordPatchset folder or your Vencord or Equicord clone. BetterVencord's build deletes `dist`, so plugins copied there are lost.
3. Rebuild the way you usually do. For BetterVencord that's `pnpm dlx tsx scripts/build.ts`, adding `--equicord` for Equicord.
4. Restart Discord or Vesktop and turn the plugins on in Settings. To update, copy the folders again and rebuild.

## Releases

`.github/workflows/release.yml` builds them on GitHub Actions. Every push that changes `plugins/`, `vencord.pin` or `equicord.pin` builds the pinned Vencord and Equicord with the plugins and uploads both to the `devbuild` release. Its title ends in the commit hash, which is how both updaters spot a new build. The pin files hold the upstream commits, and once a day the workflow moves them to upstream's newest, commits that as aquaryuo and builds again, so friends also get upstream fixes. Actions > Release > Run workflow builds by hand.

The updaters read the release through GitHub's API without signing in, so the repo has to stay public.

Don't run `install.ps1` on the development PC. Vesktop there loads `vencord\dist`, and the script would overwrite that build.

## Development

- `plugins/` holds the plugins, one folder each, with an `index.ts` or `index.tsx`.
- `vencord/` is a clone of upstream Vencord that `update.ps1` creates. It isn't committed, and nothing in it is edited.
- `vencord/src/userplugins` is a junction to `plugins/`, so Vencord builds the plugins in.
- `tsconfig.json` lets the plugins use Vencord's import aliases (`@utils/*`, `@api/*`, `@webpack/common` and the rest).
- `node_modules` and `packages` are junctions to Vencord's, so plugins can import its packages, such as `@vencord/discord-types`.

You need git and Node 22 or newer. pnpm runs through corepack, so it needs no separate install.

---

> New discord server, feel free to drop by
> https://discord.gg/ryuo
