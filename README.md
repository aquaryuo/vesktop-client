# vesktop-client

My Vencord plugins:

- Quote: `/quote` on a reply, or `/quote-link` with a message link, draws the message as a quote image that only you see. You can send it, save it or copy it.
- Emoji Interface: restyles the emoji, sticker and GIF picker, and adds resizing, GIF tags, a Downloads tab and moving favorites between accounts.
- MyCommands: lists these plugins' commands in their own section of the command list.
- FakePing: right-click a message and pick Fake Ping to highlight it like a ping. Only you see it.

## Install

This works with the Vesktop or Vencord you already have on Windows. Your Vencord settings, themes and other plugins stay as they are.

1. Quit Vesktop or Discord, including from the system tray.
2. Open PowerShell and run:

   ```powershell
   irm https://raw.githubusercontent.com/aquaryuo/vesktop-client/main/install.ps1 | iex
   ```

3. Open Vesktop or Discord and turn the plugins on in Settings > Vencord > Plugins.

The script finds your Vencord files and replaces them with this repo's build, which is upstream Vencord with these plugins added. For Vesktop it uses `%APPDATA%\vesktop\sessionData\vencordFiles`, or the folder set as Vencord Location. For the Discord app with Vencord installed it uses `%APPDATA%\Vencord\dist`.

Updates come through Settings > Vencord > Updater, the same as before, but from this repo. With automatic updates on, Vencord installs them when it starts.

To go back to plain Vencord, use Repair Vencord in Vesktop's tray menu, or run Vencord's installer and pick Repair for the Discord app. Either one also removes these plugins, so run the script again if you used it by mistake.

On macOS or Linux, download `vencordDesktopMain.js`, `vencordDesktopPreload.js`, `vencordDesktopRenderer.js` and `vencordDesktopRenderer.css` from the [latest release](https://github.com/aquaryuo/vesktop-client/releases/latest) into Vesktop's `vencordFiles` folder while Vesktop is closed.

## Releases

GitHub Actions builds the release in `.github/workflows/release.yml`:

- Every push that changes `plugins/` or `vencord.pin` builds the pinned Vencord with the plugins and uploads the files to the `devbuild` release. The release title ends in the commit hash, which is how Vencord's updater spots a new build.
- `vencord.pin` holds the upstream Vencord commit. Once a day the workflow moves it to upstream's newest commit, commits that as aquaryuo and builds again, so friends also get Vencord's own fixes.
- Actions > Release > Run workflow builds by hand.

Vencord's updater reads the release through GitHub's API without signing in, so the repo has to stay public.

Don't run `install.ps1` on the development PC. Vesktop there loads `vencord\dist`, and the script would overwrite that build.

## Development

- `plugins/` holds the plugins, one folder each, with an `index.ts` or `index.tsx`.
- `vencord/` is a clone of upstream Vencord that `update.ps1` creates. It isn't committed, and nothing in it is edited.
- `vencord/src/userplugins` is a junction to `plugins/`, so Vencord builds the plugins in.
- `tsconfig.json` lets the plugins use Vencord's import aliases (`@utils/*`, `@api/*`, `@webpack/common` and the rest).
- `node_modules` and `packages` are junctions to Vencord's, so plugins can import its packages, such as `@vencord/discord-types`.

You need git and Node 22 or newer. pnpm runs through corepack, so it needs no separate install.

### Setup

1. Run `.\update.ps1`. It clones Vencord, links `plugins/`, installs dependencies and builds.
2. In Vesktop, open Settings > Vesktop (under Vencord Settings), scroll to Developer Options and click Open Developer Settings. Under Vencord Location, click Change and pick the `vencord\dist` folder the script printed. Quit Vesktop from the tray and start it again.
3. Turn the plugins on in Settings > Vencord > Plugins.

### Writing a plugin

1. Copy `plugins/_template` to a new folder whose name doesn't start with `_`. The build skips folders that start with `_` or `.`.
2. Run `corepack pnpm watch` inside `vencord/`. It rebuilds on every save.
3. Press Ctrl+R in Vesktop to reload.
4. Typecheck with `node vencord\node_modules\typescript\bin\tsc -p tsconfig.json --noEmit` from the repo root.

Stop the watcher when you're done.

### Updates on the development PC

- Vesktop updates itself as usual. The custom Vencord Location doesn't change that.
- Vencord updates through Settings > Vencord > Updater. On this build the updater runs `git pull` and rebuilds, and with automatic updates on it does that when Vesktop starts. Upstream gitignores `src/userplugins`, so updates never touch `plugins/`.
- The in-app updater doesn't install dependencies. If an update fails to build, run `.\update.ps1`.
- Pulls in `vencord/` must stay fast-forward, which is why nothing in it is edited.
