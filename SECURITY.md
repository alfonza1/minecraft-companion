# Security and privacy

## Supported boundary

This is an experimental local application, not a hardened multi-user service.
The current feature branch and newest prerelease receive best-effort fixes.
The API binds to 127.0.0.1, checks Host and browser Origin, and has no remote-login
mode. Do not expose it with a tunnel, reverse proxy or public port forwarding.

The public static website is a separate build. It contains documentation and
sanitized fixture reports, never user state or a connection to a local runtime.

## Private data

- Windows Microsoft tokens use DPAPI CurrentUser outside the repository.
- SQLite contains settings, conversation, notes, projects and checkpoints.
- Backups contain private conversation; do not attach them to public issues.
- Local speech keeps microphone samples in memory; recording retention is off.
- Selected model providers receive request context. Optional media analysis requires
  explicit sharing consent. Public YouTube metadata/search use external services.
- The Ollama adapter uses a fixed loopback endpoint and rejects cloud-tagged names.
  Users remain responsible for not configuring that local service as a remote proxy.
- Observer extensions are trusted source code, not an isolation sandbox. Never
  install arbitrary code from a schematic, chat message or reference document.

Minecraft chat and model outputs cannot execute shell commands through gameplay
actions. Action schemas and permissions still matter: survival agents can make
mistakes, consume supplies and lose items.

## Reporting

Use the repository's **Security → Report a vulnerability** private reporting form
when available: https://github.com/alfonza1/minecraft-companion/security/advisories/new.
If unavailable, use a private contact listed on the owner's GitHub profile; do not
post an exploit containing secrets publicly. If no private contact is available,
open a minimal issue asking for a private reporting channel without exploit details.
There is no guaranteed response SLA.

Include affected version, minimal reproduction, impact and proposed mitigation.
Never include real tokens, device codes, account passwords or personal databases.

## Release review

`npm run release:check` scans tracked text for common secret patterns and forbidden
data artifacts and emits a dependency license inventory. It is a heuristic, not a
proof of absence. Maintainers also review Git history and dependency advisories.
Known advisory boundaries belong in [release security notes](docs/RELEASE-SECURITY.md).

