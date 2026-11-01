export const repository = 'https://github.com/alfonza1/minecraft-companion';
export const source = `${repository}/tree/feat/minecraft-companion`;
export const pages = [
  ['/', 'Home', 'Your AI Minecraft survival teammate — open-source autonomous agents'],
  ['/get-started/', 'Get started', 'Install your first agent'],
  ['/how-it-works/', 'How it works', 'From a goal to an observed result'],
  ['/features/', 'Features', 'A teammate with real boundaries'],
  ['/docs/', 'Docs', 'Find your way through the system'],
  ['/engineering/', 'Engineering', 'Evidence before claims'],
  ['/contribute/', 'Contribute', 'Build the next capability'],
  ['/roadmap/', 'Roadmap', 'An open direction, not a promise'],
] as const;
export const lifecycle = [
  { name: 'Perceive', code: 'world-state', text: 'Mineflayer events become timestamped observations: loaded blocks, nearby entities, inventory, health and position. Unloaded terrain remains unknown.', file: 'services/world-state/index.js' },
  { name: 'Remember', code: 'memory', text: 'Local SQLite keeps explicit notes, projects, task stacks, approved chests and construction checkpoints. Relevant notes and bounded conversation history are retrieved for the next request.', file: 'services/memory/store.js' },
  { name: 'Plan', code: 'orchestrator', text: 'A supported model returns a structured reply and a bounded action plan. Common commands bypass inference. This diagram explains execution, not private model reasoning.', file: 'services/agent-orchestrator/index.js' },
  { name: 'Validate', code: 'action schema', text: 'Strict schemas reject unknown actions and invalid arguments. Permissions, observed resources, reservations and approved blueprints constrain execution.', file: 'services/companion-runtime/index.js' },
  { name: 'Act', code: 'skill executor', text: 'One body executes cancellable, deterministic skills. Movement, gathering, crafting and block placement do not need a new model call for every step.', file: 'services/skill-executor/teammate.js' },
  { name: 'Recover', code: 'checkpoints', text: 'Server observations confirm results. Interruptions preserve checkpoints; failed prerequisites produce bounded recovery or an honest blocker. Reconnection returns paused.', file: 'services/agent-orchestrator/task-stack.js' },
];
export const docs = [
  { title: 'Installation & first session', group: 'Start here', file: 'docs/INSTALLATION.md', text: 'Windows setup, portable experimental planning, local models, Microsoft device login and first Realm connection.' },
  { title: 'Architecture & trust boundaries', group: 'Understand', file: 'docs/ARCHITECTURE.md', text: 'Runtime ownership, event flow, provider isolation, world observations, memory and cancellation.' },
  { title: 'Capabilities & limitations', group: 'Understand', file: 'docs/CAPABILITIES.md', text: 'Tested skills, supported shapes, observed inventory and what still needs a human.' },
  { title: 'Teammate controls', group: 'Use the agent', file: 'docs/TEAMMATE.md', text: 'Temporary tasks, return home, supply chests, interruption, routines and safety permissions.' },
  { title: 'Build Studio', group: 'Use the agent', file: 'services/build-planner/README.md', text: 'Blueprint validation, exact placement counts, recipe yields, shared materials and approval.' },
  { title: 'Local API', group: 'Develop', file: 'docs/API.md', text: 'HTTP routes, WebSocket events, lifecycle commands, observer extensions and origin protection.' },
  { title: 'Extend the agent', group: 'Develop', file: 'docs/EXTENSIONS.md', text: 'Working observation extension, validation contracts and safe paths for new action skills.' },
  { title: 'Evaluation methodology', group: 'Research', file: 'docs/EVALUATION.md', text: 'Reproducible contract tests, local survival fixtures, model measurements and honest limits.' },
  { title: 'Troubleshooting', group: 'Use the agent', file: 'docs/TROUBLESHOOTING.md', text: 'Unsupported Realm versions, missing models, microphone permissions, paused tasks and updates.' },
  { title: 'Security & privacy', group: 'Maintain', file: 'SECURITY.md', text: 'Local storage, model data sharing, disclosure process, untrusted inputs and supported boundaries.' },
  { title: 'Contributing', group: 'Develop', file: 'CONTRIBUTING.md', text: 'Development setup, tests, source ownership, contribution standards and review process.' },
  { title: 'Release & deployment', group: 'Maintain', file: 'docs/RELEASING.md', text: 'Static hosting, versioned source packages, checksums, license review and reproducible builds.' },
];
export const features = [
  { title: 'Goal-driven work', tag: 'Implemented · bounded skills', text: 'Ask for iron. The skill checks approved chests, prepares food and torches, makes basic tools, searches exposed ore, returns, smelts and deposits confirmed results.', limit: 'Exposed reachable ore only. General cave and branch mining are not implemented.' },
  { title: 'A shared build workspace', tag: 'Implemented · approval required', text: 'Import a supported schematic or reconstruct an authorized reference. Inspect the stored blueprint, calculate materials and divide the work between human and agent.', limit: 'Counts are exact for a validated blueprint, not hidden blocks in a video. Supported construction shapes and site limits apply.' },
  { title: 'Conversation alongside action', tag: 'Implemented · provider dependent', text: 'Talk while a safe task continues. Interrupt for help and resume the saved task. Choose separate work and conversation models within a provider.', limit: 'Local speech and global push-to-talk have Windows setup. Response latency depends on hardware and the model.' },
  { title: 'An observable runtime', tag: 'Implemented · actual events', text: 'Watch actual inventory, task status, connection events, model identity and reported token usage in the local dashboard. Inspect saved notes and approved storage.', limit: 'No hidden chain-of-thought display. No remote chunk knowledge or access to the human player’s full inventory.' },
  { title: 'Safety below the model', tag: 'Implemented · initial controllers', text: 'Deterministic eating, retreat, gear upkeep, navigation bounds and resource reservations run without inference for every action. Pause gates model and gameplay work.', limit: 'Safety controls reduce risk; they do not guarantee survival. Start in a disposable world and supervise valuable builds.' },
  { title: 'Local-first intelligence', tag: 'Implemented · experimental Ollama adapter', text: 'Use an installed local Ollama model or an existing Codex, Claude Code or OpenCode configuration. Keep your memory and project database on your machine.', limit: 'Optional hosted providers can charge and receive request context. Image/video analysis has separate provider and consent requirements.' },
];
export const contributions = [
  ['Beginner', 'Make a blocker understandable', 'Improve a documented error with a recovery step. Add a regression test and keep the original diagnosis.'],
  ['Beginner', 'Improve keyboard navigation', 'Test the setup and build preview without a mouse. Submit a focused accessibility fix with a browser check.'],
  ['Intermediate', 'Add a perception observer', 'Use the v1 observer contract to summarize current observations. Include unavailable-state and validation tests.'],
  ['Intermediate', 'Validate another construction state', 'Add a placement adapter, state verification and an isolated survival fixture. Never silently substitute blocks.'],
  ['Advanced', 'Bring secure auth to another OS', 'Implement native credential-store protection, cancellation and migration tests without plaintext fallback.'],
  ['Advanced', 'Research a second environment', 'Extract a narrow perception/action contract backed by a real adapter. Keep environment-specific permissions explicit.'],
];
