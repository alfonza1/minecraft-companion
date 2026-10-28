import { ArrowRight, ShieldAlert } from 'lucide-react';
import type { CompanionState } from '../../../packages/shared-types';
import { setupIssues } from '../../../packages/shared-types/setup-issues';

export default function SetupIssues({ state, navigate }: { state: CompanionState; navigate: (page: string) => void }) {
  const issues = setupIssues(state);
  if (!issues.length) return null;
  return <div className="planning-invitation setup-issue-banner" role="alert" aria-label="Setup needs attention">
    <ShieldAlert size={20} aria-hidden="true" />
    <div>{issues.length === 1 ? <><h3>{issues[0].title}</h3><p>{issues[0].detail}</p></> : <><h3>A few things need attention</h3><ul>{issues.map(issue => <li key={issue.id}><strong>{issue.title}:</strong> {issue.detail}</li>)}</ul></>}</div>
    <button className="button" onClick={() => navigate('setup')}>Review issue{issues.length > 1 ? 's' : ''}<ArrowRight size={14} /></button>
  </div>;
}
