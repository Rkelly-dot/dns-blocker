package api

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"sort"
	"strings"

	"dns-blocker/blocklist"
	"dns-blocker/store"
)

// Server holds everything the API handlers need to do their job.
type Server struct {
	log      *store.QueryLog
	blocklist *blocklist.List
	apiKey   string
}

// New creates a new API server. It reads the API key from the
// DNS_API_KEY environment variable — never hardcode secrets in source.
func New(ql *store.QueryLog, bl *blocklist.List) *Server {
	key := os.Getenv("DNS_API_KEY")
	if key == "" {
		log.Fatal("DNS_API_KEY environment variable is not set — refusing to start without auth")
	}
	return &Server{log: ql, blocklist: bl, apiKey: key}
}

// Start registers all routes and begins listening on the given address.
func (s *Server) Start(addr string) {
	mux := http.NewServeMux()

	mux.HandleFunc("/api/log",   s.auth(s.handleLog))
	mux.HandleFunc("/api/stats", s.auth(s.handleStats))
	mux.HandleFunc("/api/rules", s.auth(s.handleRules))

	log.Printf("API server listening on %s", addr)

	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("Failed to start API server: %v", err)
	}
}

// auth is middleware — it wraps a handler and checks the API key first.
// If the key is wrong or missing, it returns 401 and never calls the handler.
// This is the "single header" auth from your original spec.
func (s *Server) auth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-API-Key") != s.apiKey {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		next(w, r)
	}
}

// writeJSON is a helper that sets the Content-Type header and encodes
// any Go value as JSON into the response body.
func writeJSON(w http.ResponseWriter, data any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

// handleLog returns the last 1,000 queries from the ring buffer.
// GET /api/log
func (s *Server) handleLog(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	writeJSON(w, s.log.Entries())
}

// handleStats returns aggregate counts and the top 10 most-queried domains.
// GET /api/stats
func (s *Server) handleStats(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	total, blocked := s.log.Stats()

	// Count how many times each domain appears in the log.
	entries := s.log.Entries()
	counts := make(map[string]int)
	for _, e := range entries {
		counts[e.Domain]++
	}

	// Sort domains by count descending, take top 10.
	type domainCount struct {
		Domain string `json:"domain"`
		Count  int    `json:"count"`
	}
	var top []domainCount
	for domain, count := range counts {
		top = append(top, domainCount{domain, count})
	}
	sort.Slice(top, func(i, j int) bool {
		return top[i].Count > top[j].Count
	})
	if len(top) > 10 {
		top = top[:10]
	}

	writeJSON(w, map[string]any{
		"total_queries":   total,
		"total_blocked":   blocked,
		"top_domains":     top,
	})
}

// handleRules handles both GET (list rules) and POST (add rule).
// DELETE is handled by checking the URL path suffix.
// GET    /api/rules
// POST   /api/rules
// DELETE /api/rules/{domain}
func (s *Server) handleRules(w http.ResponseWriter, r *http.Request) {
	switch r.Method {

	case http.MethodGet:
		// For now returns an empty list — Milestone 5 (SQLite) fills this in.
		writeJSON(w, []string{})

	case http.MethodPost:
		var body struct {
			Domain string `json:"domain"`
			Action string `json:"action"` // "block" or "allow"
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, "invalid json", http.StatusBadRequest)
			return
		}
		body.Domain = strings.ToLower(strings.TrimSpace(body.Domain))
		if body.Domain == "" {
			http.Error(w, "domain is required", http.StatusBadRequest)
			return
		}
		// Milestone 5 will persist this to SQLite.
		// For now, just add it to the in-memory blocklist.
		s.blocklist.AddTemporary(body.Domain)
		writeJSON(w, map[string]string{"status": "ok", "domain": body.Domain})

	case http.MethodDelete:
		// Extract domain from path: /api/rules/doubleclick.net
		domain := strings.TrimPrefix(r.URL.Path, "/api/rules/")
		domain = strings.ToLower(strings.TrimSpace(domain))
		if domain == "" {
			http.Error(w, "domain is required", http.StatusBadRequest)
			return
		}
		// Milestone 5 will remove from SQLite too.
		s.blocklist.RemoveTemporary(domain)
		writeJSON(w, map[string]string{"status": "ok", "domain": domain})

	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}