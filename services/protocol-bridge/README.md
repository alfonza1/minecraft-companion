# Local Java protocol bridge

Optional client-side [ViaProxy 3.4.14](https://github.com/ViaVersion/ViaProxy/releases/tag/v3.4.14) translates the supported Mineflayer **26.1** client protocol to a **26.3** server. Nothing is installed on a Realm. This is a compatibility path, not native Mineflayer 26.3 support.

Run `powershell -NoProfile -File scripts/Setup-ProtocolBridge.ps1` from the repository, or use the normal bootstrap. The installer reuses Java 17+ / a compiler when available, otherwise downloads a private checksummed Temurin 21 JDK into the application cache. It pins the proxy JAR SHA256, compiles the small adapter and records source/artifact checksums. No Java, auth files or binaries are committed. Sources changed since installation require rebuilding.

The proxy binds an ephemeral **127.0.0.1** port, checks a random per-session frontend username, and accepts only the owning bot connection. Bedrock and unrelated translation stacks are disabled. Runtime startup verifies the artifact and Java executable hashes before launch.

Microsoft device authentication and DPAPI storage remain in the existing Prismarine Auth adapter. A private Node account worker retains the Minecraft access token; it never passes that token to Java. The Java adapter receives the verified profile and chat-signing certificate through private stdin. Its one-use process capability authorizes a loopback callback; Node performs the fixed Mojang session-server join request. Java arguments, dashboard responses and files never contain account tokens or signing keys. Signed-session acceptance still needs a real licensed account test.

Stopping disconnects the bot, closes the proxy/callback, kills the account worker, waits for Java exit and removes the run directory. Pausing an already-connected bot keeps its connection but gates gameplay/model/audio work. An interrupted connection preparation is cancelled.

`client.js` also supplies the missing movement tick-boundary packet for translated 26.3 sessions. Mineflayer 4.39 otherwise triggers the server's per-client-tick movement limit ([upstream issue 4189](https://github.com/PrismarineJS/mineflayer/issues/4189)). The adapter preserves coordinates and timing, appending only `tick_end` after each movement packet. Native connections are unchanged.

## Data fidelity

ViaBackwards may substitute new server items and blocks. Live inventory is therefore labeled **observed-client-projection**, with `inventoryExact: false` and separate client/server versions. It is excluded from project inventory reconciliation. Assigned gathering, crafting/mining collection and exact survival construction are blocked while translated. Blueprint calculations remain valid for their saved, explicitly selected native version, not a claim about new 26.3 recipes or inventory identities.

The setup page distinguishes installed artifacts, successful disposable local gameplay verification and actual Realm sign-in. A successful ping or offline fixture does not establish Microsoft authorization, signed chat, Realm access or correct mapping of every block.

## Local integration

After explicitly accepting the Minecraft EULA, `scripts/Setup-ModernTest.ps1` prepares private Java 25 and a pinned official 26.3 server, separate from the user's Minecraft install. `node scripts/test-modern-bridge.mjs` runs a disposable localhost-only offline survival world and records actual observations and cleanup under Git metadata / the external bridge cache. It never tests against a Realm.

ViaProxy is GPL-3.0 licensed; the project downloads its official release instead of vendoring or disguising it. See [upstream license](https://github.com/ViaVersion/ViaProxy/blob/main/LICENSE). Adapters compiled against that GPL component are provided as source here; review upstream redistribution obligations before packaging a binary distribution.
