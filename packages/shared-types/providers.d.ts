export type ModelProvider = 'codex' | 'claude' | 'opencode';
export const MODEL_PROVIDERS: Readonly<Record<ModelProvider, string>>;
export function modelSelection(settings: { provider?: ModelProvider; model: string; providerModels?: Partial<Record<ModelProvider, string>>; separateConversationModel?:boolean;conversationModels?:Partial<Record<ModelProvider,string>> },role?:'conversation'|'work'): { provider: ModelProvider; model: string };
