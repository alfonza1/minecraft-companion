export const MODEL_PROVIDERS = Object.freeze({ codex: 'Codex', claude: 'Claude Code', opencode: 'OpenCode' });
export function modelSelection(settings) {
  const provider = settings.provider || 'codex';
  return { provider, model: provider === 'codex' ? settings.model : settings.providerModels?.[provider] || '' };
}
