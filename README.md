# vesktop-client

My plugins for Vencord and Equicord:

- Quote: `/quote` on a reply, or `/quote-link` with a message link, draws the message as a quote image that only you see. You can send it, save it or copy it.
- Emoji Interface: restyles the emoji, sticker and GIF picker, and adds resizing, GIF tags, a Downloads tab, hiding servers and categories, and moving favorites between accounts.
- MyCommands: lists these plugins' commands in their own section of the command list.
- FakePing: right-click a message and pick Fake Ping to highlight it like a ping. Only you see it.
- Optimize This S\*\*t: makes Discord cheaper to draw without changing how it looks. It removes design-debug styles Discord ships to everyone, drops GPU-layer tricks from its CSS, moves server folder icons with positioning instead of transforms, stops hidden chat separators from getting layers of their own, and makes menus open faster: menus and popouts no longer restyle the whole app when they open or close, and emoji menus no longer rebuild Discord's emoji list. On by default. An optional setting, off by default, stops drawing the app behind Settings and other dimmed windows, which makes them smoother but shows a plain dark backdrop instead of the dimmed app.

## Install

You need Vesktop, Equibop, or the Discord app with Vencord or Equicord, on Windows, macOS or Linux. Open it at least once before you start.

### Windows

1. Close it completely. Right-click its icon next to the clock and pick Quit.
2. Press the Windows key, type `PowerShell` and press Enter.
3. Copy this line, paste it into the window with Ctrl+V, and press Enter:

   ```powershell
   irm https://raw.githubusercontent.com/aquaryuo/vesktop-client/main/install.ps1 | iex
   ```

4. Wait until it says `installed`, then open it again.
5. Open Settings (the cog at the bottom left), go to Plugins under Vencord or Equicord, and turn on the ones you want.

### macOS and Linux

1. Close it completely. On macOS, click it and press Cmd+Q. On Linux, right-click its tray icon and pick Quit.
2. Open Terminal. On macOS, press Cmd+Space, type `Terminal` and press Enter.
3. Copy this line, paste it into Terminal, and press Enter:

   ```bash
   curl -fsSL https://raw.githubusercontent.com/aquaryuo/vesktop-client/main/install.sh | sh
   ```

4. Wait until it says `installed`, then open it again.
5. Open Settings (the cog at the bottom left), go to Plugins under Vencord or Equicord, and turn on the ones you want.

That's it. Updates install by themselves.

### Uninstall

Close the app the same way, then run this in PowerShell on Windows:

```powershell
irm https://raw.githubusercontent.com/aquaryuo/vesktop-client/main/uninstall.ps1 | iex
```

Or this in Terminal on macOS and Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/aquaryuo/vesktop-client/main/uninstall.sh | sh
```

It removes only these plugins and puts back the build each app had before you installed them, which the install script saved. Installs from before 2026-11-08 have no saved copy, so they get the official Vencord or Equicord build instead. Your settings and other plugins stay. It also deletes Quote's font cache, and if the install script set up Discord to load Vencord or Equicord, it undoes that too.

<br>

<details>
<summary>How it works, and going back</summary>

<br>

Your settings, themes and other plugins stay as they are. The script finds your Vencord or Equicord files and replaces them with this repo's build, which is upstream Vencord or Equicord with these plugins added. In the table, Config means `%APPDATA%` on Windows, `~/Library/Application Support` on macOS and `~/.config` on Linux.

| You use | The script replaces | With |
|---|---|---|
| Vesktop | `Config/vesktop/sessionData/vencordFiles`, or the folder set as Vencord Location | the four `vencordDesktop*` files |
| Discord app with Vencord | `Config/Vencord/dist` | `patcher.js`, `preload.js`, `renderer.js` and `renderer.css` |
| Equibop | `Config/equibop/sessionData/equicord.asar` | `equibop.asar` |
| Discord app with Equicord | `Config/Equicord/equicord.asar` | `desktop.asar` |

The first time, the script saves each file it replaces next to it as `<file>.before-plugins`, so uninstalling can put it back.

If the Discord app has a Vencord or Equicord folder but isn't set up to load it, the script runs Vencord's or Equicord's own installer for Discord first. If Discord loads its client from somewhere else, that folder is left alone.

On Linux the script also finds Vesktop and Equibop installed from Flatpak, under `~/.var/app/<app id>/config`. A Vencord or Equicord you built yourself gets the plugins added to its source instead (see [Built from source](#built-from-source)). Equibop set to load Equicord from any other custom folder is skipped. Equicord no longer makes a Vesktop build, so Vesktop always gets the Vencord build.

Updates come through the Updater page in Vencord or Equicord settings, the same as before, but from this repo. With automatic updates on, they install when the app starts.

To go back, use the [uninstall](#uninstall) command. Repair Vencord in Vesktop's tray menu, Repair Equicord in Equibop's, or Repair in the Vencord or Equicord installer also remove the plugins, but they put the official build back instead of the one you had.

</details>

### Built from source

If you build Vencord or Equicord yourself, for example with [BetterVencord](https://github.com/Davilarek/BetterVencordPatchset), run the same command as above. The script finds your build through the Discord app or the Vencord Location set in Vesktop or Equibop. It copies the plugins into the build's `src/userplugins` folder, and for BetterVencord also into the patchset's, so your own rebuilds keep them. Then it runs `pnpm build` in the build's folder (`dist/Vencord` for BetterVencord) with the packages already installed there, so nothing else in your build changes. This needs pnpm and takes about a minute. It keeps a copy of your build from before the plugins, which the uninstall command puts back. If the build fails, your previous build is kept.

The plugins don't update by themselves in a build like this. Run the command again to update them.

BetterVencord rebuilt with its own build script after 2026-11-04 gets `@zenfs/core` 2.9.0, which can't read the virtual filesystem that older versions saved, so its settings disappear. Until BetterVencord pins it, change `"@zenfs/core": "^2.5.6"` to `"@zenfs/core": "2.8.3"` in `src/patch-package_json.patch` and rebuild.

To add them by hand instead:

1. Get this repo with Code > Download ZIP, or `git clone https://github.com/aquaryuo/vesktop-client`.
2. Copy the folders `emojiInterface`, `fakePing`, `myCommands`, `optimizeThisShit` and `quote` from `plugins` into your build's userplugins folder:
   - BetterVencord: `src/userplugins` in your BetterVencordPatchset folder. Its build deletes `dist`, so plugins copied there are lost.
   - Vencord or Equicord from source: `src/userplugins` in your clone.
3. Build again the way you usually do. For BetterVencord that's `pnpm dlx tsx scripts/build.ts`, adding `--equicord` for Equicord.
4. Restart Discord or Vesktop and turn the plugins on in Settings.

To update them by hand, copy the folders again and rebuild.

## Releases

GitHub Actions builds the release in `.github/workflows/release.yml`:

- Every push that changes `plugins/`, `vencord.pin` or `equicord.pin` builds the pinned Vencord and Equicord with the plugins and uploads both builds to the `devbuild` release. The release title ends in the commit hash, which is how both updaters spot a new build.
- `vencord.pin` and `equicord.pin` hold the upstream commits. Once a day the workflow moves them to upstream's newest commits, commits that as aquaryuo and builds again, so friends also get upstream fixes.
- Actions > Release > Run workflow builds by hand.

Both updaters read the release through GitHub's API without signing in, so the repo has to stay public.

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
