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
  codex?: { available: boolean | null; authenticated: boolean | null; version: string | null; error: string | null };
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
  tasks: any[];
  projects: Project[];
  memories: { id: string; label: string; value: string }[];
  conversation: {
    id: string;
    role: "user" | "companion";
    text: string;
    at: string;
  }[];
  usage: {
    requests: number;
    inputTokens: number;
    outputTokens: number;
    cachedInputTokens: number;
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
    maxRequestsPerHour: number;
    maxInputTokens: number;
    voice: {
      enabled: boolean;
      handsFree: boolean;
      speed: number;
      volume: number;
      inputDevice: string;
      outputDevice: string;
      pushToTalk?: { key: string; modifiers: ('Ctrl' | 'Alt' | 'Shift')[] };
      ttsVoice?: string;
    };
  };
  voice: { available: boolean; status: string; error: string | null; desktop?: { running: boolean; hotkey: string; mode: string } };
  logs: { at: string; level: string; message: string }[];
}
