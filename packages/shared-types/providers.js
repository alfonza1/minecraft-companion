export const MODEL_PROVIDERS = Object.freeze({ codex: 'Codex', claude: 'Claude Code', opencode: 'OpenCode', ollama: 'Ollama (local, free)' });
export function modelSelection(settings,role='work') {
  const provider = settings.provider || 'codex';
  const work=provider === 'codex' ? settings.model : settings.providerModels?.[provider] || '';
  return { provider, model: role==='conversation'&&settings.separateConversationModel ? settings.conversationModels?.[provider]||work : work };
}
