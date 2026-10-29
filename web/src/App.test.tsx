import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { ToastProvider } from "./components/Toast";
import type { QueryEntry, Rule } from "./api";

const entries: QueryEntry[] = [
  { domain: "ads.example.com", blocked: true, timestamp: new Date(Date.now() - 30_000).toISOString() },
  { domain: "cdn.example.net", blocked: false, timestamp: new Date(Date.now() - 60_000).toISOString() },
  { domain: "tracker.example.org", blocked: true, timestamp: new Date(Date.now() - 90_000).toISOString() },
];

let rules: Rule[] = [];

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function installFetchMock() {
  rules = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.pathname === "/dashboard/api/log") return json(entries);

      if (url.pathname === "/dashboard/api/stats") {
        return json({
          total_queries: 1284,
          total_blocked: 730,
          top_domains: [
            { domain: "ads.example.com", count: 42 },
            { domain: "cdn.example.net", count: 17 },
          ],
          rules_count: rules.length,
        });
      }

      if (url.pathname === "/dashboard/api/system") {
        return json({ status: "ok", uptime_seconds: 3720, blocklist_size: 241_882, rules_count: rules.length });
      }

      if (url.pathname === "/dashboard/api/rules" && method === "GET") return json(rules);

      if (url.pathname === "/dashboard/api/rules" && method === "POST") {
        const body = JSON.parse(String(init?.body ?? "{}")) as { domain: string; action: Rule["action"] };
        const rule: Rule = { domain: body.domain, action: body.action, created_at: new Date().toISOString() };
        rules = [rule, ...rules];
        return json({ status: "ok", domain: rule.domain, action: rule.action, rule });
      }

      if (url.pathname.startsWith("/dashboard/api/rules/") && method === "DELETE") {
        const domain = decodeURIComponent(url.pathname.split("/").pop() ?? "");
        rules = rules.filter((rule) => rule.domain !== domain);
        return json({ status: "ok", domain });
      }

      return json({ error: "not found" }, 404);
    }),
  );
}

function renderAt(path: string) {
  window.history.pushState({}, "", path);
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </MemoryRouter>,
  );
}

describe("dashboard", () => {
  beforeEach(() => {
    installFetchMock();
  });

  it("renders buffered query stats and the live tail", async () => {
    renderAt("/");

    expect((await screen.findAllByText("1,284")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("730").length).toBeGreaterThan(0);
    expect(screen.getAllByText("56.9").length).toBeGreaterThan(0); // block rate tile (suffix is separate)
    expect(screen.getAllByText("ads.example.com").length).toBeGreaterThan(0);
    expect(screen.getAllByText("BLOCK").length).toBe(2);
  });

  it("filters the query table by domain", async () => {
    const user = userEvent.setup();
    renderAt("/queries");

    expect(await screen.findByText("page 1 / 1")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Filter queries by domain"), "ads");
    expect(screen.getByText("ads.example.com")).toBeInTheDocument();
    expect(screen.queryByText("cdn.example.net")).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("Filter queries by domain"));
    expect(await screen.findByText("cdn.example.net")).toBeInTheDocument();
    expect(screen.getByText("tracker.example.org")).toBeInTheDocument();
  });

  it("creates a rule from the rules page and lists it", async () => {
    const user = userEvent.setup();
    renderAt("/rules");

    expect(await screen.findByText("No manual rules yet")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Domain"), "Ads.Test.");
    await user.click(screen.getByRole("button", { name: /^Add rule$/i }));

    expect(await screen.findByText("ads.test")).toBeInTheDocument();
    expect(await screen.findByText("ads.test will be blocked")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getByText("block")).toBeInTheDocument();
  });

  it("opens the command palette with the keyboard shortcut", async () => {
    const user = userEvent.setup();
    renderAt("/");

    await screen.findAllByText("1,284");
    await user.keyboard("{Control>}k{/Control}");

    expect(screen.getByRole("dialog", { name: "Command palette" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Command palette" })).not.toBeInTheDocument();
  });
});
