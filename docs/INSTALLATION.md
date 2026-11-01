# Installation and first session

## Support matrix

| Environment | Status |
| --- | --- |
| Windows 11, Node.js 24 LTS | Primary development and desktop/Realm target |
| macOS/Linux, Node.js 24 LTS | Experimental browser/offline planning; not full parity |
| Microsoft Realm authentication | Windows DPAPI persistence currently required |
| Native global voice | Windows only; optional Python setup |
| Docker | Not supported for complete desktop audio/auth experience |
| Minecraft | Pinned native Java 26.3 adapter; runtime checks exact compatibility |

The free software does not include Minecraft, a licensed bot account, Realm service
or hosted model subscriptions. Install Git and Node.js 24 LTS first. Minimum core
runtime is Node 22.13 because the SQLite API must work without an extra flag.

```text
git clone --branch feat/minecraft-companion --recurse-submodules https://github.com/alfonza1/minecraft-companion.git
cd minecraft-companion
npm run install:agent
npm start
```

Open http://127.0.0.1:4365 and select Setup. install:agent uses the lockfile,
verifies pinned native protocol downloads and builds the dashboard. It does not
install or modify Minecraft, pull an LLM model, or enable a paid service.
Versioned release ZIPs can be extracted and used with the last two commands.
The skins submodule is only needed for optional upstream skin tooling.

Windows optional voice/desktop setup:

```powershell
.\scripts\Bootstrap.ps1 -SkipBridge -DesktopShortcut
```

This can install safe missing prerequisites via winget and downloads local speech
models. It builds an unsigned local WebView2 desktop shell. There is no signed
one-click executable release yet. Launch shortcuts keep targeting the checkout.

## Model setup

For the no-subscription path, install Ollama and a locally runnable model fitting
your hardware, for example `ollama pull qwen3:8b`. Check the model's own license
and resource requirements. In Setup select Ollama, refresh models, and choose one.
It uses only 127.0.0.1:11434. Cloud-tagged models are excluded. Quality and latency
are model/hardware-dependent; do not assume a small model can reliably plan every task.

Alternatively select an existing Codex, Claude Code or OpenCode installation and
complete its official sign-in. Hosted requests may incur provider charges.
Source/YouTube analysis remains provider-specific and requires explicit sharing.

## Realm and voice setup

1. Use a separate licensed Java bot account and invite it to the Realm.
2. Connect Minecraft account. Enter the device code at Microsoft's official URL;
   complete password/MFA only there. Tokens stay outside Git.
3. Select the invited Realm and run the compatibility check.
4. Choose your player name, test microphone/output and pick a push-to-talk key.
5. Start the first session, set Home and approve supply chests. Try a small goal.

The website does not log in for you or connect to local services. macOS/Linux
Realm auth intentionally fails closed until a secure native credential adapter exists.

## Updating and backing up

Use Settings to back up local data. Stop the companion before replacing runtime
files. In a clean checkout: `git pull --ff-only`, then `npm run install:agent`.
With a release archive, extract the new version to its own folder and rerun setup.
Private data is outside the checkout; do not delete it during updates.

`npm run check:install` checks prerequisites/build presence.
`npm run health` adds runtime/provider/speech diagnostics. Never post raw private
state or database backups in an issue. See [troubleshooting](TROUBLESHOOTING.md).


Claude Agent SDK is proprietary optional integration code, not relicensed as open source.
Run `npm run setup:claude` only if choosing that provider; it installs outside the
repository. The free local Ollama path and core installation do not require it.
