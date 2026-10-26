# vesktop-client

My Vencord plugins:

- Quote: `/quote` on a reply, or `/quote-link` with a message link, draws the message as a quote image that only you see. You can send it, save it or copy it.
- Emoji Interface: restyles the emoji, sticker and GIF picker, and adds resizing, GIF tags, a Downloads tab and moving favorites between accounts.
- MyCommands: lists these plugins' commands in their own section of the command list.
- FakePing: right-click a message and pick Fake Ping to highlight it like a ping. Only you see it.

## Install

You need Windows and either Vesktop, or Discord with Vencord. Open it at least once before you start.

1. Close Vesktop or Discord completely. Right-click its icon next to the clock and pick Quit.
2. Press the Windows key, type `PowerShell` and press Enter.
3. Copy this line, paste it into the window with Ctrl+V, and press Enter:

   ```powershell
   irm https://raw.githubusercontent.com/aquaryuo/vesktop-client/main/install.ps1 | iex
   ```

4. Wait until it says `installed`, then open Vesktop or Discord again.
5. Open Settings (the cog at the bottom left), go to Plugins under Vencord, and turn on the ones you want.

That's it. Updates install by themselves.

<br>

<details>
<summary>How it works, going back, and macOS or Linux</summary>

<br>

Your Vencord settings, themes and other plugins stay as they are. The script finds your Vencord files and replaces them with this repo's build, which is upstream Vencord with these plugins added. For Vesktop it uses `%APPDATA%\vesktop\sessionData\vencordFiles`, or the folder set as Vencord Location. For the Discord app with Vencord installed it uses `%APPDATA%\Vencord\dist`.

Updates come through Settings > Vencord > Updater, the same as before, but from this repo. With automatic updates on, Vencord installs them when it starts.

To go back to plain Vencord, use Repair Vencord in Vesktop's tray menu, or run Vencord's installer and pick Repair for the Discord app. Either one also removes these plugins, so run the script again if you used it by mistake.

On macOS or Linux, download `vencordDesktopMain.js`, `vencordDesktopPreload.js`, `vencordDesktopRenderer.js` and `vencordDesktopRenderer.css` from the [latest release](https://github.com/aquaryuo/vesktop-client/releases/latest) into Vesktop's `vencordFiles` folder while Vesktop is closed.

</details>

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
