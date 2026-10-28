import { Backpack, Search, Shield } from "lucide-react";
import { useState } from "react";
import type { CompanionState } from "../../../packages/shared-types";
import { Badge, Empty, human, ItemIcon, Panel, time } from "./shared";
export default function Inventory({ state }: { state: CompanionState }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const items = state.world?.inventory || [];
  const filtered = items.filter(
    (item) =>
      item.name.includes(query.toLowerCase().replaceAll(" ", "_")) &&
      (filter === "all" ||
        (filter === "tools"
          ? /pickaxe|axe|shovel|hoe|sword|bow/.test(item.name)
          : filter === "food"
            ? /beef|pork|chicken|bread|apple|carrot|potato|fish|salmon|cod|melon|berry|stew|rabbit|mutton/.test(
                item.name,
              )
            : !/pickaxe|axe|shovel|hoe|sword|bow/.test(item.name))),
  );
  return (
    <>
      {state.world?.inventoryExact === false ? <div className="info-note"><p>{state.connection.projected ? `Live translated inventory: item names are the ${state.connection.version} client view of Realm ${state.connection.serverVersion}. Newer items can appear as substitutes.` : 'Waiting for server inventory confirmation. Transfer amounts are unverified until the Realm confirms them.'} These counts are excluded from exact project resource tracking.</p></div> : null}
      <div className="section-toolbar">
        <div className="search-field">
          <Search size={17} />
          <input
            aria-label="Search inventory"
            placeholder="Search inventory…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="segmented">
          {["all", "tools", "food", "materials"].map((name) => (
            <button
              key={name}
              className={filter === name ? "selected" : ""}
              onClick={() => setFilter(name)}
            >
              {human(name)}
            </button>
          ))}
        </div>
        <Badge tone={state.world ? "green" : "muted"}>
          {state.world
            ? `Observed ${time(state.world.observedAt)}`
            : "Not observed"}
        </Badge>
      </div>
      <div className="inventory-layout">
        <Panel
          title="Backpack"
          eyebrow="LIVE MINECRAFT INVENTORY"
          action={
            <span className="count-label">{items.length} occupied slots</span>
          }
        >
          {!state.world ? (
            <Empty icon={Backpack} title="Your backpack comes with you">
              Connect to a Realm to see actual inventory events here. No
              inventory has been assumed.
            </Empty>
          ) : filtered.length ? (
            <div className="item-grid">
              {filtered.map((item) => (
                <div
                  key={item.slot}
                  className="item-card"
                  title={`Slot ${item.slot} · Stack size ${item.stackSize}`}
                >
                  <div className="item-art">
                    <ItemIcon name={item.name} />
                    <span>{item.count}</span>
                  </div>
                  <strong>{item.displayName || human(item.name)}</strong>
                  <small>
                    {item.durabilityRemaining !== undefined
                      ? `${item.durabilityRemaining} durability`
                      : `Slot ${item.slot}`}
                  </small>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              icon={Search}
              title={items.length ? "No matching items" : "Traveling light"}
            >
              {items.length
                ? "Try a different search or filter."
                : "The companion has no observed items in its backpack."}
            </Empty>
          )}
        </Panel>
        <div>
          <Panel
            title="Equipped"
            action={<Shield size={18} className="muted" />}
          >
            {state.world ? (
              Object.entries(state.world.equipment).map(([slot, item]) => (
                <div className="equipment-row" key={slot}>
                  <div className="equipment-slot">
                    {item ? (
                      <ItemIcon name={item.name} />
                    ) : (
                      <Shield size={20} />
                    )}
                  </div>
                  <div>
                    <small>{human(slot)}</small>
                    <strong>
                      {item ? item.displayName || human(item.name) : "Empty"}
                    </strong>
                  </div>
                </div>
              ))
            ) : (
              <p className="quiet-empty">
                Equipment appears once your companion connects.
              </p>
            )}
          </Panel>
          <div className="info-note">
            <Shield size={17} />
            <p>
              Only your companion’s inventory is visible. Your own items and
              distant chests are unknown until you report or share them.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
