export type RuntimeState =
  | "DISCONNECTED"
  | "PAUSED"
  | "ACTIVE"
  | "BUSY"
  | "ERROR";
export interface Item {
  slot: number;
  name: string;
  displayName: string;
  count: number;
  type: number;
  stackSize: number;
  durabilityRemaining?: number;
}
export interface Realm {
  id: number;
  name: string;
  owner: string;
  state: string;
  activeVersion?: string;
}
export interface Blueprint {
  version: string;
  dimensions: { x: number; y: number; z: number };
  blocks: {
    x: number;
    y: number;
    z: number;
    name: string;
    properties?: Record<string, string>;
    section?: string;
  }[];
  provenance: "schematic" | "reconstructed" | "estimated";
  uncertainties: string[];
}
export interface Project {
  id: string;
  name: string;
  blueprint?: Blueprint;
  revision?: number;
  approvedRevision?: number;
  status: string;
  materials?: any;
  assignments?: any;
  checkpoint?: any;
  references?: any[];
  [key: string]: any;
}
export interface CompanionState {
  ai?: { provider: 'codex' | 'claude' | 'opencode'; available?: boolean | null; authenticated?: boolean | null; version?: string | null; error?: string | null; modelState?: { active: { provider?: string; model: string | null; purpose: string; startedAt: string } | null; last: { provider?: string; model: string; purpose: string; at: string } | null } };
  codex?: { available: boolean | null; authenticated: boolean | null; version: string | null; error: string | null; model?: { active: { provider?: string; model: string | null; purpose: string; startedAt: string } | null; last: { provider?: string; model: string; purpose: string; at: string } | null } };
  state: RuntimeState;
  planning?: boolean;
  connection: {
    status: string;
    username: string | null;
    realmId: number | null;
    version: string | null;
    error: string | null;
    reconnectAttempt: number;
    serverVersion?: string;
    transport?: 'native' | 'bridge';
    projected?: boolean;
  };
  auth: {
    status: string;
    error?: string | null;
    issue?: string | null;
    username: string | null;
    device: null | {
      verificationUri: string;
      userCode: string;
      expiresAt: string;
    };
  };
  realms: Realm[];
  world: null | {
    observedAt: string;
    inventoryExact?: boolean;
    provenance?: string;
    position: { x: number; y: number; z: number };
    dimension: string;
    health: number;
    food: number;
    oxygen: number;
    experience: Record<string, number>;
    inventory: Item[];
    equipment: Record<string, Item | null>;
    nearbyPlayers: any[];
    nearbyEntities: any[];
    timeOfDay: number;
  };
  currentTask: any | null;
  taskStack?: { held: boolean; switching: boolean; frames: { id: string; label: string; status: string; step: number; steps: number; actions: { tool: string; args: Record<string, any> }[]; error?: string }[] };
  teammate?: {
    preferences: { autoRestock: boolean;busyMode?:boolean;autoDeposit?:boolean; updates: 'quiet' | 'useful' | 'chatty'; resumeAfterHelp: boolean };
    workAreas?:{id:string;radius:number;dimension:string;position:{x:number;y:number;z:number}}[];
    idleWork?:{held:boolean;reason:string;running:boolean};
    locations: { id: string; name: string; position: { x: number; y: number; z: number }; dimension: string; observedAt: string }[];
    routines: { id: string; label: string; supplies: { name: string; count: number }[] }[];
    supplies: { id: string; name: string;depositAllowed?:boolean; position: { x: number; y: number; z: number }; dimension: string; allowedItems: string[]; observedAt: string | null; inventory: { name: string; count: number }[] | null }[];
    deaths: { id: string; at: string; position: { x: number; y: number; z: number }; dimension: string; status: string; warning: string; inventory: { name: string; count: number }[]; gained?: Record<string, number> }[];
  };
  tasks: any[];
  projects: Project[];
  memories: { id: string; label: string; value: string }[];
  conversation: {
    id: string;
    role: "user" | "companion";
    kind?: string;
    text: string;
    at: string;
  }[];
  usage: {
    inputBudgetUsed?: number;
    inputBudgetRenewedAt?: string | null;
    requests: number;
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
    unreportedRequests?: number;
    billingCost: null | number;
  };
  settings: {
    miningZone?: null | { x: number; y: number; z: number; radius: number };
    realmId: number | null;
    playerName: string;
    autonomy: string;
    combat: string;
    followDistance: number;
    movementSpeed?: 'normal' | 'brisk';
    alertFrequency: string;
    model: string;
    provider?: 'codex' | 'claude' | 'opencode';
    providerModels?: { claude?: string; opencode?: string };
    lowTokenMode?: boolean;
    fastResponses?:boolean;
    maxRequestsPerHour: number;
    maxInputTokens: number;
    inputTokenLimitEnabled?: boolean;
    voice: {
      enabled: boolean;
      desktopEnabled?: boolean;
      desktopInputDevice?: {name:string;hostapi:number} | null;
      desktopOutputDevice?: {name:string;hostapi:number} | null;
      handsFree: boolean;
      speed: number;
      volume: number;
      inputDevice: string;
      outputDevice: string;
      pushToTalk?: { key: string; modifiers: ('Ctrl' | 'Alt' | 'Shift')[] };
      ttsVoice?: string;
    };
  };
  voice: { available: boolean; status: string; error: string | null; desktop?: { running: boolean; hotkey: string; mode: string; phase?: string; error?: string | null } };
  logs: { at: string; level: string; message: string }[];
}
