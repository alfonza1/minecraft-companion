import { Backpack, Box, Search, Shield, Sword } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CompanionState, Item } from "../../../packages/shared-types";
import { Badge, Empty, human, ItemIcon, Panel, time } from "./shared";

export default function Inventory({ state }: { state: CompanionState }) {
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [selected, setSelected] = useState<number | null>(null);
  const [recent, setRecent] = useState<
    { name: string; count: number; at: string }[]
  >([]);
  const previous = useRef<{
    realm: number | null;
    counts: Record<string, number>;
  } | null>(null);
  const items = state.world?.inventory || [],
    carried = items.filter((item) => item.slot >= 9 && item.slot <= 44),
    item = items.find((value) => value.slot === selected);
  useEffect(() => {
    if (!state.world) {
      previous.current = null;
      setRecent([]);
      return;
    }
    const counts: Record<string, number> = {};
    for (const current of state.world.inventory)
      counts[current.name] = (counts[current.name] || 0) + current.count;
    if (
      previous.current &&
      previous.current.realm === state.connection.realmId
    ) {
      const before = previous.current.counts;
      const added = Object.entries(counts)
        .filter(([name, count]) => count > (before[name] || 0))
        .map(([name, count]) => ({
          name,
          count: count - (before[name] || 0),
          at: state.world!.observedAt,
        }));
      if (added.length) setRecent((old) => [...added, ...old].slice(0, 8));
    }
    previous.current = { realm: state.connection.realmId, counts };
  }, [state.world?.observedAt, state.connection.realmId]);
  const matches = (value: Item) =>
    value.name.includes(query.toLowerCase().replaceAll(" ", "_")) &&
    (filter === "all" ||
      (filter === "tools" &&
        /pickaxe|axe|shovel|hoe|sword|bow/.test(value.name)) ||
      (filter === "food" &&
        /beef|pork|chicken|bread|apple|carrot|potato|salmon|cod|melon|berry|stew|rabbit|mutton/.test(
          value.name,
        )) ||
      (filter === "materials" &&
        !/pickaxe|axe|shovel|hoe|sword|bow|helmet|chestplate|leggings|boots/.test(
          value.name,
        )));
  function slots(start: number, length: number) {
    return (
      <div className="ws-slot-grid">
        {Array.from({ length }, (_, index) => start + index).map((slot) => {
          const value = items.find((current) => current.slot === slot);
          return (
            <button
              key={slot}
              className={`ws-slot ${value ? "filled" : ""} ${value && !matches(value) ? "dimmed" : ""} ${selected === slot ? "selected" : ""}`}
              aria-label={
                value
                  ? `Slot ${slot}: ${value.count} ${human(value.name)}`
                  : `Slot ${slot}: empty`
              }
              onClick={() => setSelected(slot)}
            >
              {value ? (
                <>
                  <ItemIcon name={value.name} />
                  <b>{value.count}</b>
                  {value.maxDurability ? (
                    <progress
                      aria-label={`${human(value.name)} durability`}
                      value={value.durabilityRemaining}
                      max={value.maxDurability}
                    />
                  ) : null}
                </>
              ) : (
                <span>{start === 36 ? slot - start + 1 : ""}</span>
              )}
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <>
      <div className="ws-inventory-summary">
        <div>
          <Backpack size={27} />
          <span>
            <strong>
              {state.world ? `${carried.length} / 36` : "Not observed"}
            </strong>
            <small>Backpack slots occupied</small>
          </span>
        </div>
        <div>
          <Shield size={24} />
          <span>
            <strong>{state.world ? `${36 - carried.length} free` : "—"}</strong>
            <small>Room for the adventure</small>
          </span>
        </div>
        <Badge
          tone={
            state.world?.inventoryExact !== false && state.world
              ? "green"
              : "muted"
          }
        >
          {state.world
            ? `Observed ${time(state.world.observedAt)}`
            : "Connect to inspect inventory"}
        </Badge>
      </div>
      {state.world?.inventoryExact === false ? (
        <div className="info-note gold">
          These inventory counts are unverified or translated. Exact resource
          allocation is disabled until the server confirms them.
        </div>
      ) : null}
      <div className="section-toolbar">
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label="Search inventory"
            placeholder="Find something in the backpack…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="ws-filter-pills">
          {["all", "tools", "food", "materials"].map((value) => (
            <button
              key={value}
              className={filter === value ? "selected" : ""}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {human(value)}
            </button>
          ))}
        </div>
      </div>
      <div className="ws-inventory-layout">
        <Panel
          title="Backpack"
          eyebrow="MINECRAFT INVENTORY"
          action={<span className="count-label">Actual slot positions</span>}
        >
          {state.world ? (
            <>
              <div className="ws-backpack">
                {slots(9, 27)}
                <span className="eyebrow">HOTBAR</span>
                {slots(36, 9)}
              </div>
              {query || filter !== "all" ? (
                <p className="note">
                  {carried.filter(matches).length} matching stacks. Other
                  occupied slots are dimmed, not removed.
                </p>
              ) : null}
              <div className="ws-item-inspector">
                {item ? (
                  <>
                    <ItemIcon name={item.name} />
                    <div>
                      <h3>{item.displayName || human(item.name)}</h3>
                      <p>
                        {item.count} items · stack limit {item.stackSize} · slot{" "}
                        {item.slot}
                      </p>
                      <small>
                        {item.maxDurability
                          ? `${item.durabilityRemaining} / ${item.maxDurability} durability`
                          : "Observed in companion inventory"}
                      </small>
                    </div>
                  </>
                ) : (
                  <>
                    <Box size={25} />
                    <p>
                      {selected === null
                        ? "Choose a slot to inspect its contents."
                        : "This slot is empty."}
                    </p>
                  </>
                )}
              </div>
            </>
          ) : (
            <Empty
              icon={Backpack}
              title="The backpack comes with your companion"
            >
              Connect to Minecraft to see the actual inventory. No items are
              assumed.
            </Empty>
          )}
        </Panel>
        <Panel title="Ready for the world" eyebrow="EQUIPMENT">
          {state.world ? (
            Object.entries(state.world.equipment).map(([slot, value]) => (
              <div className="ws-equipment" key={slot}>
                <div>
                  {value ? (
                    <ItemIcon name={value.name} />
                  ) : (
                    <Shield size={22} />
                  )}
                </div>
                <span>
                  <small>{human(slot)}</small>
                  <strong>
                    {value ? value.displayName || human(value.name) : "Empty"}
                  </strong>
                  {value?.maxDurability ? (
                    <progress
                      aria-label={`${slot} durability`}
                      value={value.durabilityRemaining}
                      max={value.maxDurability}
                    />
                  ) : null}
                </span>
              </div>
            ))
          ) : (
            <p className="quiet-empty">Equipment is unknown until observed.</p>
          )}
          {state.world &&
          !items.some((value) => value.name.endsWith("_pickaxe")) ? (
            <p className="ws-equipment-note">
              <Sword size={15} />
              No pickaxe observed. Mining may need preparation.
            </p>
          ) : null}
        </Panel>
      </div>
      <div className="ws-overview-grid">
        <Panel title="Recently seen arriving" eyebrow="THIS OPEN WORKSPACE">
          {recent.length ? (
            <div className="ws-resource-shortlist">
              {recent.map((row, index) => (
                <div key={`${row.name}-${row.at}-${index}`}>
                  <ItemIcon name={row.name} />
                  <span>
                    <strong>{human(row.name)}</strong>
                    <small>{time(row.at)} · observed inventory increase</small>
                  </span>
                  <b>+{row.count}</b>
                </div>
              ))}
            </div>
          ) : (
            <p className="quiet-empty">
              Newly observed item increases appear here. Gathering, transfers
              and crafting are not inferred from inventory changes alone.
            </p>
          )}
        </Panel>
        <Panel title="Known storage" eyebrow="LAST OBSERVED CONTENTS">
          {state.workspace?.storage.length ? (
            state.workspace.storage.map((chest) => (
              <details className="ws-chest" key={chest.id}>
                <summary>
                  <Box size={17} />
                  <strong>{chest.name}</strong>
                  <Badge tone={chest.stale ? "gold" : "muted"}>
                    {chest.stale ? "Needs recheck" : "Observed snapshot"}
                  </Badge>
                </summary>
                <p className="note">
                  {chest.observedAt
                    ? new Date(chest.observedAt).toLocaleString()
                    : "Contents not observed"}{" "}
                  · {human(chest.dimension)}. Other players may have changed
                  this chest.
                </p>
                <div className="ws-storage-items">
                  {chest.inventory.map((value) => (
                    <div key={value.name}>
                      <ItemIcon name={value.name} />
                      <span>{human(value.name)}</span>
                      <b>{value.count}</b>
                    </div>
                  ))}
                </div>
              </details>
            ))
          ) : (
            <p className="quiet-empty">
              Approve nearby supply chests in My companion. Contents are
              remembered only after the bot opens and observes them.
            </p>
          )}
        </Panel>
      </div>
      <p className="note">
        Your player inventory is private to your client. Report contributions in
        Collaboration; they remain distinct from verified stock.
      </p>
    </>
  );
}
