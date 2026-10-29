package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"dns-blocker/blocklist"
	"dns-blocker/store"
)

func newTestServer(t *testing.T) (*Server, *store.QueryLog) {
	t.Helper()
	t.Setenv("DNS_API_KEY", "test-key")

	rules, err := store.OpenRules(filepath.Join(t.TempDir(), "rules.db"))
	if err != nil {
		t.Fatalf("open rules: %v", err)
	}
	t.Cleanup(func() { rules.Close() })

	ql := store.NewQueryLog(10)
	return New(ql, blocklist.New(), rules), ql
}

func call(h http.Handler, method, path, key string, body any) *httptest.ResponseRecorder {
	var payload []byte
	if body != nil {
		payload, _ = json.Marshal(body)
	}
	req := httptest.NewRequest(method, path, bytes.NewReader(payload))
	if key != "" {
		req.Header.Set("X-API-Key", key)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestKeyedAPI(t *testing.T) {
	s, _ := newTestServer(t)
	h := s.Handler()

	if rec := call(h, http.MethodGet, "/api/log", "", nil); rec.Code != http.StatusUnauthorized {
		t.Fatalf("missing key: want 401, got %d", rec.Code)
	}
	if rec := call(h, http.MethodGet, "/api/log", "wrong", nil); rec.Code != http.StatusUnauthorized {
		t.Fatalf("wrong key: want 401, got %d", rec.Code)
	}
	if rec := call(h, http.MethodGet, "/api/log", "test-key", nil); rec.Code != http.StatusOK {
		t.Fatalf("valid key: want 200, got %d", rec.Code)
	}
	if rec := call(h, http.MethodPost, "/api/log", "test-key", nil); rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("wrong method: want 405, got %d", rec.Code)
	}
}

func TestDashboardRouteNeedsNoKey(t *testing.T) {
	s, _ := newTestServer(t)
	h := s.Handler()

	for _, path := range []string{"/dashboard/api/log", "/dashboard/api/stats", "/dashboard/api/rules", "/dashboard/api/system"} {
		if rec := call(h, http.MethodGet, path, "", nil); rec.Code != http.StatusOK {
			t.Fatalf("%s: want 200, got %d", path, rec.Code)
		}
	}
}

func TestRuleLifecycle(t *testing.T) {
	s, _ := newTestServer(t)
	h := s.Handler()

	// Start from a manual block, then let a persisted allow rule override it.
	s.blocklist.AddManual("ads.example.com")

	// Create an allow rule with a messy domain; it should be normalised.
	rec := call(h, http.MethodPost, "/dashboard/api/rules", "", map[string]string{
		"domain": "  Ads.Example.COM. ",
		"action": "allow",
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("create: want 200, got %d (%s)", rec.Code, rec.Body.String())
	}

	var created struct {
		Domain string     `json:"domain"`
		Action string     `json:"action"`
		Rule   store.Rule `json:"rule"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode create: %v", err)
	}
	if created.Domain != "ads.example.com" || created.Action != store.ActionAllow {
		t.Fatalf("unexpected rule: %+v", created)
	}

	// The allow rule must win over the earlier block for the same name.
	if s.blocklist.IsBlocked("ads.example.com") {
		t.Fatal("allow rule should override a block")
	}

	// Upsert the same domain as a block.
	rec = call(h, http.MethodPost, "/dashboard/api/rules", "", map[string]string{
		"domain": "ads.example.com",
		"action": "block",
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("upsert: want 200, got %d", rec.Code)
	}

	rec = call(h, http.MethodGet, "/dashboard/api/rules", "", nil)
	var rules []store.Rule
	if err := json.Unmarshal(rec.Body.Bytes(), &rules); err != nil {
		t.Fatalf("decode list: %v", err)
	}
	if len(rules) != 1 || rules[0].Action != store.ActionBlock {
		t.Fatalf("expected one block rule, got %+v", rules)
	}
	if !s.blocklist.IsBlocked("sub.ads.example.com") {
		t.Fatal("block rule should match subdomains")
	}

	// Delete removes both the row and the runtime effect.
	if rec = call(h, http.MethodDelete, "/dashboard/api/rules/ads.example.com", "", nil); rec.Code != http.StatusOK {
		t.Fatalf("delete: want 200, got %d", rec.Code)
	}
	if s.blocklist.IsBlocked("ads.example.com") {
		t.Fatal("deleted block rule should stop matching")
	}
	if rec = call(h, http.MethodDelete, "/dashboard/api/rules/ads.example.com", "", nil); rec.Code != http.StatusNotFound {
		t.Fatalf("second delete: want 404, got %d", rec.Code)
	}
}

func TestRuleValidation(t *testing.T) {
	s, _ := newTestServer(t)
	h := s.Handler()

	cases := []struct {
		name   string
		body   map[string]string
		status int
	}{
		{"empty domain", map[string]string{"domain": "  ", "action": "block"}, http.StatusBadRequest},
		{"scheme in domain", map[string]string{"domain": "https://example.com", "action": "block"}, http.StatusBadRequest},
		{"bad action", map[string]string{"domain": "example.com", "action": "deny"}, http.StatusBadRequest},
		{"default action", map[string]string{"domain": "example.com"}, http.StatusOK},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := call(h, http.MethodPost, "/dashboard/api/rules", "", tc.body)
			if rec.Code != tc.status {
				t.Fatalf("want %d, got %d (%s)", tc.status, rec.Code, rec.Body.String())
			}
		})
	}
}

func TestStatsAndSystem(t *testing.T) {
	s, ql := newTestServer(t)
	h := s.Handler()

	ql.Add("ads.example.com", true)
	ql.Add("ads.example.com", true)
	ql.Add("cdn.example.net", false)

	rec := call(h, http.MethodGet, "/dashboard/api/stats", "", nil)
	var stats struct {
		TotalQueries int `json:"total_queries"`
		TotalBlocked int `json:"total_blocked"`
		TopDomains   []struct {
			Domain string `json:"domain"`
			Count  int    `json:"count"`
		} `json:"top_domains"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &stats); err != nil {
		t.Fatalf("decode stats: %v", err)
	}
	if stats.TotalQueries != 3 || stats.TotalBlocked != 2 {
		t.Fatalf("unexpected stats: %+v", stats)
	}
	if len(stats.TopDomains) != 2 || stats.TopDomains[0].Domain != "ads.example.com" || stats.TopDomains[0].Count != 2 {
		t.Fatalf("unexpected top domains: %+v", stats.TopDomains)
	}

	rec = call(h, http.MethodGet, "/dashboard/api/system", "", nil)
	var system struct {
		Status        string `json:"status"`
		BlocklistSize int    `json:"blocklist_size"`
		RulesCount    int    `json:"rules_count"`
		UptimeSeconds int    `json:"uptime_seconds"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &system); err != nil {
		t.Fatalf("decode system: %v", err)
	}
	if system.Status != "ok" || system.UptimeSeconds < 0 {
		t.Fatalf("unexpected system payload: %+v", system)
	}
}
