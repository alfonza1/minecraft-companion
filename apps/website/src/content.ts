export const repository = "https://github.com/alfonza1/minecraft-companion";
export const source = `${repository}/tree/feat/minecraft-companion`;
export const pages = [
  [
    "/",
    "Home",
    "Meet your new gaming buddy. An open-source AI companion to explore, build and hang out with, starting with Minecraft Survival.",
  ],
  [
    "/get-started/",
    "Get started",
    "Set up your side of the desk: local installation, model, account and voice.",
  ],
  [
    "/games/",
    "Games",
    "One game today. Room for the next. Minecraft Survival and community integration proposals.",
  ],
  [
    "/how-it-works/",
    "How it works",
    "Follow one request through perception, planning, action and recovery.",
  ],
  [
    "/features/",
    "Workspace",
    "Less checking in. More playing. Explore the actual companion workspace.",
  ],
  [
    "/docs/",
    "Docs",
    "Find your way. Then go deeper. Search player and developer guides.",
  ],
  [
    "/engineering/",
    "Engineering",
    "Show the evidence. Keep the limits. Reproducible tests and honest measurements.",
  ],
  [
    "/contribute/",
    "Contribute",
    "Make one thing better. Start with a working extension and a focused contribution.",
  ],
  [
    "/roadmap/",
    "Roadmap",
    "Keep it useful. Open the next door. Current capabilities and future research.",
  ],
] as const;
export const lifecycle = [
  {
    name: "Perceive",
    code: "world-state",
    text: "Mineflayer events become timestamped observations: loaded blocks, nearby entities, inventory, health and position. Unloaded terrain remains unknown.",
    file: "services/world-state/index.js",
  },
  {
    name: "Remember",
    code: "memory",
    text: "Local SQLite keeps explicit notes, projects, task stacks, approved chests and construction checkpoints. Relevant notes and bounded conversation history are retrieved for the next request.",
    file: "services/memory/store.js",
  },
  {
    name: "Plan",
    code: "orchestrator",
    text: "A supported model returns a structured reply and a bounded action plan. Common commands bypass inference. This diagram explains execution, not private model reasoning.",
    file: "services/agent-orchestrator/index.js",
  },
  {
    name: "Validate",
    code: "action schema",
    text: "Strict schemas reject unknown actions and invalid arguments. Permissions, observed resources, reservations and approved blueprints constrain execution.",
    file: "services/companion-runtime/index.js",
  },
  {
    name: "Act",
    code: "skill executor",
    text: "One body executes cancellable, deterministic skills. Movement, gathering, crafting and block placement do not need a new model call for every step.",
    file: "services/skill-executor/teammate.js",
  },
  {
    name: "Recover",
    code: "checkpoints",
    text: "Server observations confirm results. Interruptions preserve checkpoints; failed prerequisites produce bounded recovery or an honest blocker. Reconnection returns paused.",
    file: "services/agent-orchestrator/task-stack.js",
  },
];
export const docs = [
  {
    title: "Installation & first session",
    group: "Start here",
    file: "docs/INSTALLATION.md",
    text: "Windows setup, portable experimental planning, local models, Microsoft device login and first Realm connection.",
  },
  {
    title: "Your companion workspace",
    group: "Use the companion",
    file: "docs/WORKSPACE.md",
    text: "Live activity, missions, inventory, raw/finished resource views, assistance requests and shared responsibilities.",
  },
  {
    title: "Personality & saved moments",
    group: "Use the companion",
    file: "docs/COMPANION-PERSONALITY.md",
    text: "Communication style, real mode behaviors, proactive remarks and optional memories backed by existing sources.",
  },
  {
    title: "Architecture & trust boundaries",
    group: "Understand",
    file: "docs/ARCHITECTURE.md",
    text: "Runtime ownership, event flow, provider isolation, world observations, memory and cancellation.",
  },
  {
    title: "Capabilities & limitations",
    group: "Understand",
    file: "docs/CAPABILITIES.md",
    text: "Tested skills, supported shapes, observed inventory and what still needs a human.",
  },
  {
    title: "Teammate controls",
    group: "Use the agent",
    file: "docs/TEAMMATE.md",
    text: "Temporary tasks, return home, supply chests, interruption, routines and safety permissions.",
  },
  {
    title: "Build Studio",
    group: "Use the agent",
    file: "services/build-planner/README.md",
    text: "Blueprint validation, exact placement counts, recipe yields, shared materials and approval.",
  },
  {
    title: "Game adapters",
    group: "Develop",
    file: "docs/GAME-ADAPTERS.md",
    text: "Game identity, capabilities, workspace observations and the test-only second environment.",
  },
  {
    title: "Local API",
    group: "Develop",
    file: "docs/API.md",
    text: "HTTP routes, WebSocket events, lifecycle commands, observer extensions and origin protection.",
  },
  {
    title: "Extend the agent",
    group: "Develop",
    file: "docs/EXTENSIONS.md",
    text: "Working observation extension, validation contracts and safe paths for new action skills.",
  },
  {
    title: "Evaluation methodology",
    group: "Research",
    file: "docs/EVALUATION.md",
    text: "Reproducible contract tests, local survival fixtures, model measurements and honest limits.",
  },
  {
    title: "Troubleshooting",
    group: "Use the agent",
    file: "docs/TROUBLESHOOTING.md",
    text: "Unsupported Realm versions, missing models, microphone permissions, paused tasks and updates.",
  },
  {
    title: "Security & privacy",
    group: "Maintain",
    file: "SECURITY.md",
    text: "Local storage, model data sharing, disclosure process, untrusted inputs and supported boundaries.",
  },
  {
    title: "Contributing",
    group: "Develop",
    file: "CONTRIBUTING.md",
    text: "Development setup, tests, source ownership, contribution standards and review process.",
  },
  {
    title: "Release & deployment",
    group: "Maintain",
    file: "docs/RELEASING.md",
    text: "Static hosting, versioned source packages, checksums, license review and reproducible builds.",
  },
];
export const contributions = [
  [
    "Beginner",
    "Make a blocker understandable",
    "Improve a documented error with a recovery step. Add a regression test and keep the original diagnosis.",
  ],
  [
    "Beginner",
    "Improve keyboard navigation",
    "Test the setup and build preview without a mouse. Submit a focused accessibility fix with a browser check.",
  ],
  [
    "Intermediate",
    "Add a perception observer",
    "Use the v1 observer contract to summarize current observations. Include unavailable-state and validation tests.",
  ],
  [
    "Intermediate",
    "Validate another construction state",
    "Add a placement adapter, state verification and an isolated survival fixture. Never silently substitute blocks.",
  ],
  [
    "Advanced",
    "Bring secure auth to another OS",
    "Implement native credential-store protection, cancellation and migration tests without plaintext fallback.",
  ],
  [
    "Advanced",
    "Research a second game",
    "Use the adapter contract and a permitted game interface. Start with a bounded cooperative goal and keep game-specific permissions explicit.",
  ],
];
