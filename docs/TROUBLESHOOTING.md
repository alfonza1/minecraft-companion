# Troubleshooting

| Symptom | What to check |
| --- | --- |
| Setup cannot start | Node 24 LTS, Git, then npm run install:agent |
| SQLite import fails | Node 22.13+ required; prefer 24 LTS |
| Dashboard unavailable | Run npm start; check port 4365 and terminal error |
| Unsupported Realm version | Run setup:native, restart while disconnected, recheck; never guess protocol |
| Microsoft sign-in needed | Connect in Setup using official device flow; do not copy tokens |
| Account has no Java profile | Complete Java username/license setup in the official launcher |
| No Realm listed | Invite the bot's separate licensed account; accept invitation and refresh |
| Ollama unavailable | Start local Ollama at 127.0.0.1:11434; refresh models |
| No local models | Download a local model in Ollama, then select it; cloud names are excluded |
| Invalid model JSON | Choose a more capable model or simplify the request; no rejected actions ran |
| Speech/device permission error | Test selected microphone/output explicitly; check OS/app permissions |
| Agent paused after reconnect | Expected safety behavior; inspect state then Resume |
| Resume says action stopping | Wait for the owned library operation; avoid launching a second controller |
| Empty/stale chest | Approve chest access and let the bot observe it; cached contents are historical |
| Blueprint cannot build | Inspect unsupported shapes, missing ingredients and worksite blockers |
| macOS/Linux account failure | Secure native credential adapter is not implemented; use browser planning |
| Source update not showing | Stop the companion, reopen launcher; source fingerprint triggers rebuild |

Back up in Settings before updating. Local data stays under the platform application
data folder, separate from source. Do not reset credentials or delete SQLite merely
to fix a frontend build. File an issue with version, OS, sanitized error and precise
steps, never a private conversation or full database.
