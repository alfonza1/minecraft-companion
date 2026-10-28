// An offline bot or an unchecked startup session is not a failed setup check.
export function setupIssues(state) {
  const issues = [];
  if (!state.planning) {
    if (['error', 'expired', 'profile-required'].includes(state.auth.status) || state.auth.error) issues.push({ id: 'minecraft-account', title: 'Minecraft sign-in needs attention', detail: state.auth.error || 'Reconnect the bot’s Minecraft account in Setup.' });
    if (!state.settings.realmId) issues.push({ id: 'realm-selection', title: 'Choose a Realm', detail: 'Select the Realm your companion should join in Setup.' });
    if (state.connection.error && ['error', 'reconnecting'].includes(state.connection.status)) issues.push({ id: 'realm-connection', title: 'Realm connection needs attention', detail: state.connection.error });
  }
  const otherProvider = state.settings.provider && state.settings.provider !== 'codex';
  if (otherProvider && (state.ai?.available === false || state.ai?.authenticated === false)) issues.push({ id: 'model-provider', title: 'Selected model provider needs attention', detail: state.ai.error || 'Check the selected provider in Settings.' });
  if (!otherProvider && (state.codex?.available === false || state.codex?.authenticated === false)) issues.push({ id: 'codex', title: 'Codex needs attention', detail: state.codex.error || 'Check the local Codex installation and sign-in in Setup.' });
  if (state.voice.error || state.voice.status === 'error') issues.push({ id: 'voice', title: 'Local speech needs attention', detail: state.voice.error || 'Check the local speech service in Setup.' });
  return issues;
}
