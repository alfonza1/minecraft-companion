import type { CompanionState } from './index';
export interface SetupIssue { id: string; title: string; detail: string }
export function setupIssues(state: Pick<CompanionState, 'planning' | 'auth' | 'settings' | 'connection' | 'codex' | 'voice'>): SetupIssue[];
