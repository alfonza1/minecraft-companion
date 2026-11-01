import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { createDesignFixture, DESIGN_SCENARIOS } from '../scripts/design-fixtures.mjs';

test('design gallery uses isolated real API projections without playable clients or public fixture setters', async () => {
  const OriginalDate = Date;
  const fixture = await createDesignFixture({ scenario: 'gathering' });
  try {
    assert.equal(fixture.runtime.bot, null);
    const state = (await fixture.app.inject('/api/state')).json();
    assert.equal(state.workspace.activity.state, 'gathering');
    assert.equal(state.workspace.activity.progress.completed, 42);
    assert.equal(state.workspace.activity.progress.total, 64);
    assert.equal(state.workspace.session.stale, false);
    const voices = (await fixture.app.inject('/api/voice/options')).json();
    assert.ok(voices.length > 0);
    assert.ok(voices.every(voice => voice.available === false));
    assert.deepEqual((await fixture.app.inject('/api/voice/devices')).json(), []);
    assert.equal((await fixture.app.inject('/api/voice/status')).statusCode, 200);
    const catalog = (await fixture.app.inject('/api/ai/codex/models')).json();
    assert.ok(Number.isFinite(Date.parse(catalog.observedAt)));
    assert.equal((await fixture.app.inject({ method: 'POST', url: '/api/design-fixture', payload: { scenario: 'building' } })).statusCode, 404);
    assert.throws(() => fixture.setFixture('unknown'), /Unknown design scenario/);
    for (const scenario of DESIGN_SCENARIOS) {
      const snapshot = fixture.setFixture(scenario);
      assert.equal(fixture.runtime.bot, null);
      assert.equal(snapshot.projects.length, ['building', 'blocked', 'mission', 'collaboration'].includes(scenario) ? 1 : 0);
      assert.equal(snapshot.conversation.length, scenario === 'hangout' ? 2 : 0);
    }
    const building = fixture.setFixture('building');
    assert.equal(building.workspace.mission.progress.completed, 35);
    assert.equal(building.workspace.resources.find(value => value.name === 'cobblestone').verifiedPlaced, 35);
    const blocked = fixture.setFixture('blocked');
    assert.equal(blocked.workspace.activity.state, 'blocked');
    assert.equal(blocked.workspace.assistance[0].type, 'recovery');
  } finally {
    await fixture.close();
    await fixture.close();
  }
  assert.equal(Date, OriginalDate);
  await assert.rejects(access(fixture.directory), { code: 'ENOENT' });
});
