import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Search, X } from "lucide-react";

export default function ToolMenu({
  open,
  close,
  navigate,
  items,
}: {
  open: boolean;
  close: () => void;
  navigate: (id: string) => void;
  items: { id: string; name: string; group: string }[];
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [query, setQuery] = useState("");
  useEffect(() => {
    if (open) {
      setQuery("");
      dialog.current?.showModal();
    } else dialog.current?.close();
  }, [open]);
  const choices = items.filter((item) =>
    `${item.name} ${item.group}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <dialog
      ref={dialog}
      className="tool-menu"
      onClose={close}
      aria-labelledby="tools-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <header>
        <div>
          <span className="eyebrow">YOUR PLAY DESK</span>
          <h2 id="tools-title">Where to?</h2>
        </div>
        <button
          className="icon-button"
          onClick={close}
          aria-label="Close navigation"
        >
          <X size={21} />
        </button>
      </header>
      <label className="tool-search">
        <Search size={19} />
        <input
          autoFocus
          aria-label="Find a workspace tool"
          placeholder="Find a tool or open a work area…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && choices.length === 1)
              navigate(choices[0].id);
            if (event.key === "ArrowDown") {
              event.preventDefault();
              dialog.current
                ?.querySelector<HTMLButtonElement>("nav button")
                ?.focus();
            }
          }}
        />
        <kbd>Esc</kbd>
      </label>
      <nav
        aria-label="Main navigation"
        onKeyDown={(event) => {
          if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
          const buttons = Array.from(
            event.currentTarget.querySelectorAll("button"),
          );
          const index = buttons.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          event.preventDefault();
          buttons[
            (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) %
              buttons.length
          ]?.focus();
        }}
      >
        {choices.map((item) => (
          <button key={item.id} onClick={() => navigate(item.id)}>
            <small>{item.group}</small>
            <span>{item.name}</span>
            <ArrowUpRight size={15} />
          </button>
        ))}
      </nav>
      {!choices.length ? (
        <p>No matching tools. Try “settings” or “inventory”.</p>
      ) : null}
      <footer>Ctrl / ⌘ K to open · Arrow keys to move · Enter to choose</footer>
    </dialog>
  );
}
