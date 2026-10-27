# vesktop-client

My plugins for Vencord and Equicord:

- Quote: `/quote` on a reply, or `/quote-link` with a message link, draws the message as a quote image that only you see. You can send it, save it or copy it.
- Emoji Interface: restyles the emoji, sticker and GIF picker, and adds resizing, GIF tags, a Downloads tab and moving favorites between accounts.
- MyCommands: lists these plugins' commands in their own section of the command list.
- FakePing: right-click a message and pick Fake Ping to highlight it like a ping. Only you see it.
- Optimize This S\*\*t: makes Discord cheaper to draw without changing how it looks. It removes design-debug styles Discord ships to everyone, drops GPU-layer tricks from its CSS, moves server folder icons with positioning instead of transforms, and stops hidden chat separators from getting layers of their own. On by default. An optional setting, off by default, stops drawing the app behind Settings and other dimmed windows, which makes them smoother but shows a plain dark backdrop instead of the dimmed app.

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

On Linux the script also finds Vesktop and Equibop installed from Flatpak, under `~/.var/app/<app id>/config`. Equibop set to load Equicord from a custom folder is skipped. Equicord no longer makes a Vesktop build, so Vesktop always gets the Vencord build.

Updates come through the Updater page in Vencord or Equicord settings, the same as before, but from this repo. With automatic updates on, they install when the app starts.

To go back, use Repair Vencord in Vesktop's tray menu or Repair Equicord in Equibop's, or run the Vencord or Equicord installer and pick Repair for the Discord app. Any of these also removes the plugins, so run the script again if you used one by mistake.

</details>

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
