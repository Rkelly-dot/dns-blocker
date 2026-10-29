package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"dns-blocker/api"
	"dns-blocker/blocklist"
	"dns-blocker/store"
)

// TestServedDashboard exercises the same routing main builds, over real HTTP,
// with the embedded UI and a temporary SQLite rules file.
func TestServedDashboard(t *testing.T) {
	t.Setenv("DNS_API_KEY", "e2e-key")

	rules, err := store.OpenRules(filepath.Join(t.TempDir(), "rules.db"))
	if err != nil {
		t.Fatalf("open rules: %v", err)
	}
	t.Cleanup(func() { rules.Close() })

	ql := store.NewQueryLog(10)
	ql.Add("ads.example.com", true)
	bl := blocklist.New()

	server := httptest.NewServer(dashboardHandler(api.New(ql, bl, rules).Handler()))
	t.Cleanup(server.Close)

	fetch := func(method, path, key string, body io.Reader) (*http.Response, string) {
		t.Helper()
		req, err := http.NewRequest(method, server.URL+path, body)
		if err != nil {
			t.Fatalf("build request: %v", err)
		}
		if key != "" {
			req.Header.Set("X-API-Key", key)
		}
		if body != nil {
			req.Header.Set("Content-Type", "application/json")
		}
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatalf("%s %s: %v", method, path, err)
		}
		defer res.Body.Close()
		data, err := io.ReadAll(res.Body)
		if err != nil {
			t.Fatalf("read body: %v", err)
		}
		return res, string(data)
	}

	// The dashboard shell is served at the root.
	res, index := fetch(http.MethodGet, "/", "", nil)
	if res.StatusCode != http.StatusOK || !strings.Contains(index, `id="root"`) {
		t.Fatalf("root: status=%d body=%q", res.StatusCode, index)
	}

	// Client-side routes survive a hard refresh.
	for _, path := range []string{"/queries", "/rules", "/system", "/queries?status=blocked"} {
		res, body := fetch(http.MethodGet, path, "", nil)
		if res.StatusCode != http.StatusOK || !strings.Contains(body, `id="root"`) {
			t.Fatalf("%s: status=%d", path, res.StatusCode)
		}
	}

	// Fingerprinted assets are served with a long-lived cache header.
	asset := regexp.MustCompile(`/assets/[^"]+\.js`).FindString(index)
	if asset == "" {
		t.Fatal("index.html does not reference a built js asset")
	}
	res, _ = fetch(http.MethodGet, asset, "", nil)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("asset %s: status=%d", asset, res.StatusCode)
	}
	if cache := res.Header.Get("Cache-Control"); !strings.Contains(cache, "immutable") {
		t.Fatalf("asset cache header = %q", cache)
	}

	// Keyed API rejects anonymous calls but the dashboard API does not.
	if res, _ := fetch(http.MethodGet, "/api/log", "", nil); res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("anonymous /api/log: want 401, got %d", res.StatusCode)
	}
	res, logBody := fetch(http.MethodGet, "/api/log", "e2e-key", nil)
	if res.StatusCode != http.StatusOK || !strings.Contains(logBody, "ads.example.com") {
		t.Fatalf("keyed /api/log: status=%d body=%q", res.StatusCode, logBody)
	}

	// Create a rule through the dashboard route and read it back through
	// the keyed API to prove both mounts share the same SQLite store.
	res, created := fetch(http.MethodPost, "/dashboard/api/rules", "", strings.NewReader(`{"domain":"ads.example.com","action":"block"}`))
	if res.StatusCode != http.StatusOK {
		t.Fatalf("create rule: status=%d body=%q", res.StatusCode, created)
	}
	res, listed := fetch(http.MethodGet, "/api/rules", "e2e-key", nil)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("list rules: status=%d", res.StatusCode)
	}
	var stored []store.Rule
	if err := json.Unmarshal([]byte(listed), &stored); err != nil {
		t.Fatalf("decode rules: %v", err)
	}
	if len(stored) != 1 || stored[0].Domain != "ads.example.com" {
		t.Fatalf("unexpected rules: %+v", stored)
	}
	if !bl.IsBlocked("sub.ads.example.com") {
		t.Fatal("rule from the HTTP API did not reach the live blocklist")
	}

	// Unknown API routes do not fall through to the SPA shell.
	res, _ = fetch(http.MethodGet, "/api/nope", "e2e-key", nil)
	if res.StatusCode == http.StatusOK {
		t.Fatalf("unknown API route returned 200")
	}
}
