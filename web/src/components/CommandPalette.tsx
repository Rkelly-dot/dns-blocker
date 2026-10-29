import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon, type IconName } from "./icons";

type Command = {
  id: string;
  label: string;
  section: "Go to" | "Actions";
  hint?: string;
  icon: IconName;
  run: () => void;
};

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<Command[]>(() => {
    const go = (to: string) => () => {
      navigate(to);
      onClose();
    };
    return [
      { id: "overview", label: "Overview", section: "Go to", icon: "overview", hint: "dashboard", run: go("/") },
      { id: "queries", label: "Queries", section: "Go to", icon: "queries", hint: "log", run: go("/queries") },
      { id: "rules", label: "Rules", section: "Go to", icon: "rules", hint: "block / allow", run: go("/rules") },
      { id: "system", label: "System", section: "Go to", icon: "system", hint: "settings", run: go("/system") },
      {
        id: "add-rule",
        label: "Add a rule",
        section: "Actions",
        icon: "plus",
        hint: "rules",
        run: go("/rules?new=1"),
      },
      {
        id: "blocked",
        label: "Show blocked queries only",
        section: "Actions",
        icon: "alert",
        hint: "queries",
        run: go("/queries?status=blocked"),
      },
      {
        id: "live",
        label: "Open live query tail",
        section: "Actions",
        icon: "terminal",
        hint: "queries",
        run: go("/queries?status=all"),
      },
    ];
  }, [navigate, onClose]);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return commands;
    return commands.filter((command) =>
      `${command.label} ${command.hint ?? ""} ${command.section}`.toLowerCase().includes(needle),
    );
  }, [commands, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 10);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    document.querySelector<HTMLElement>('[data-palette-selected="true"]')?.scrollIntoView?.({ block: "nearest" });
  }, [selected, open, results]);

  if (!open) return null;

  const runAt = (index: number) => {
    const command = results[index];
    if (command) command.run();
  };

  return (
    <div
      className="palette-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="palette">
        <div className="palette-input">
          <Icon name="search" size={15} />
          <input
            ref={inputRef}
            value={query}
            placeholder="Search pages and actions"
            aria-label="Search commands"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setSelected((current) => (results.length ? (current + 1) % results.length : 0));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setSelected((current) => (results.length ? (current - 1 + results.length) % results.length : 0));
              } else if (event.key === "Enter") {
                event.preventDefault();
                runAt(selected);
              } else if (event.key === "Escape") {
                event.preventDefault();
                onClose();
              }
            }}
          />
          <span className="kbd">esc</span>
        </div>

        <div className="palette-list">
          {results.length === 0 ? (
            <div className="palette-empty">No commands match “{query.trim()}”.</div>
          ) : (
            results.map((command, index) => {
              const showSection = index === 0 || results[index - 1].section !== command.section;
              return (
                <div key={command.id}>
                  {showSection ? <div className="palette-group">{command.section}</div> : null}
                  <button
                    type="button"
                    className={`palette-item${index === selected ? " selected" : ""}`}
                    data-palette-selected={index === selected ? "true" : undefined}
                    onMouseEnter={() => setSelected(index)}
                    onClick={() => runAt(index)}
                  >
                    <Icon name={command.icon} size={15} />
                    <span>{command.label}</span>
                    {command.hint ? <span className="hint">{command.hint}</span> : null}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
