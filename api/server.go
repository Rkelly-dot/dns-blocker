package api

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"regexp"
	"sort"
	"strings"
	"time"

	"dns-blocker/blocklist"
	"dns-blocker/store"
)

// Server holds everything the API handlers need to do their job.
type Server struct {
	log       *store.QueryLog
	blocklist *blocklist.List
	rules     *store.RuleStore
	apiKey    string
	started   time.Time
}

// New creates a new API server. It reads the API key from the
// DNS_API_KEY environment variable — never hardcode secrets in source.
func New(ql *store.QueryLog, bl *blocklist.List, rules *store.RuleStore) *Server {
	key := os.Getenv("DNS_API_KEY")
	if key == "" {
		log.Fatal("DNS_API_KEY environment variable is not set — refusing to start without auth")
	}
	if rules == nil {
		log.Fatal("rule store is required")
	}
	return &Server{
		log:       ql,
		blocklist: bl,
		rules:     rules,
		apiKey:    key,
		started:   time.Now(),
	}
}

// Handler returns every API route.
//
// Two mounts are registered:
//
//	/api/*            requires the X-API-Key header — for scripts and clients.
//	/dashboard/api/*  no key, because it is called by the dashboard that this
//	                  same process serves. The key never reaches the browser:
//	                  there is nothing to leak. This is why the HTTP listener
//	                  binds to loopback by default (see main.go) — the dashboard
//	                  is trusted at the network boundary instead.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	s.register(mux, "/api", s.auth)
	s.register(mux, "/dashboard/api", func(next http.HandlerFunc) http.HandlerFunc { return next })

	return mux
}

func (s *Server) register(mux *http.ServeMux, prefix string, guard func(http.HandlerFunc) http.HandlerFunc) {
	mux.HandleFunc("GET "+prefix+"/log", guard(s.handleLog))
	mux.HandleFunc("GET "+prefix+"/stats", guard(s.handleStats))
	mux.HandleFunc("GET "+prefix+"/rules", guard(s.handleRules))
	mux.HandleFunc("POST "+prefix+"/rules", guard(s.handleRules))
	mux.HandleFunc("DELETE "+prefix+"/rules/{domain}", guard(s.handleRuleDelete))
	mux.HandleFunc("GET "+prefix+"/system", guard(s.handleSystem))
}

// auth is middleware — it wraps a handler and checks the API key first.
// If the key is wrong or missing, it returns 401 and never calls the handler.
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
	w.Header().Set("Cache-Control", "no-store")
	json.NewEncoder(w).Encode(data)
}

// writeError returns a JSON error so the dashboard can show a real message.
func writeError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

// handleLog returns the last 1,000 queries from the ring buffer.
// GET /api/log
func (s *Server) handleLog(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, s.log.Entries())
}

// handleStats returns aggregate counts and the top 10 most-queried domains.
// GET /api/stats
func (s *Server) handleStats(w http.ResponseWriter, r *http.Request) {
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
	top := make([]domainCount, 0, len(counts))
	for domain, count := range counts {
		top = append(top, domainCount{domain, count})
	}
	sort.Slice(top, func(i, j int) bool {
		if top[i].Count == top[j].Count {
			return top[i].Domain < top[j].Domain
		}
		return top[i].Count > top[j].Count
	})
	if len(top) > 10 {
		top = top[:10]
	}

	rules, err := s.rules.List()
	if err != nil {
		log.Printf("API: failed to list rules: %v", err)
	}

	writeJSON(w, map[string]any{
		"total_queries": total,
		"total_blocked": blocked,
		"top_domains":   top,
		"rules_count":   len(rules),
	})
}

// handleSystem reports lightweight runtime facts for the dashboard.
// GET /api/system
func (s *Server) handleSystem(w http.ResponseWriter, r *http.Request) {
	rules, err := s.rules.List()
	if err != nil {
		log.Printf("API: failed to list rules: %v", err)
	}

	writeJSON(w, map[string]any{
		"status":         "ok",
		"uptime_seconds": int(time.Since(s.started).Seconds()),
		"blocklist_size": s.blocklist.Size(),
		"rules_count":    len(rules),
	})
}

// handleRules lists and creates rules.
// GET  /api/rules
// POST /api/rules
func (s *Server) handleRules(w http.ResponseWriter, r *http.Request) {
	switch r.Method {

	case http.MethodGet:
		rules, err := s.rules.List()
		if err != nil {
			log.Printf("API: list rules: %v", err)
			writeError(w, http.StatusInternalServerError, "could not read rules")
			return
		}
		writeJSON(w, rules)

	case http.MethodPost:
		var body struct {
			Domain string `json:"domain"`
			Action string `json:"action"` // "block" or "allow"
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeError(w, http.StatusBadRequest, "invalid json")
			return
		}

		domain := store.NormalizeDomain(body.Domain)
		if !validDomain(domain) {
			writeError(w, http.StatusBadRequest, "that does not look like a domain")
			return
		}

		action := strings.ToLower(strings.TrimSpace(body.Action))
		if action == "" {
			action = store.ActionBlock
		}
		if action != store.ActionBlock && action != store.ActionAllow {
			writeError(w, http.StatusBadRequest, `action must be "block" or "allow"`)
			return
		}

		rule, err := s.rules.Upsert(domain, action)
		if err != nil {
			log.Printf("API: upsert rule: %v", err)
			writeError(w, http.StatusInternalServerError, "could not save rule")
			return
		}
		s.applyRule(rule)

		writeJSON(w, map[string]any{
			"status": "ok",
			"domain": rule.Domain,
			"action": rule.Action,
			"rule":   rule,
		})

	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

// handleRuleDelete removes a rule and its effect on the live blocklist.
// DELETE /api/rules/{domain}
func (s *Server) handleRuleDelete(w http.ResponseWriter, r *http.Request) {
	domain := store.NormalizeDomain(r.PathValue("domain"))
	if !validDomain(domain) {
		writeError(w, http.StatusBadRequest, "that does not look like a domain")
		return
	}

	deleted, err := s.rules.Delete(domain)
	if err != nil {
		log.Printf("API: delete rule: %v", err)
		writeError(w, http.StatusInternalServerError, "could not delete rule")
		return
	}
	if !deleted {
		writeError(w, http.StatusNotFound, "no such rule")
		return
	}

	s.blocklist.RemoveManual(domain)
	s.blocklist.RemoveAllow(domain)

	writeJSON(w, map[string]any{"status": "ok", "domain": domain})
}

// applyRule mirrors a stored rule into the in-memory blocklist so the DNS
// path reacts immediately instead of after a restart.
func (s *Server) applyRule(rule store.Rule) {
	if rule.Action == store.ActionAllow {
		s.blocklist.AddAllow(rule.Domain)
		return
	}
	s.blocklist.AddManual(rule.Domain)
}

var domainPattern = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$`)

func validDomain(domain string) bool {
	return len(domain) <= 253 && domainPattern.MatchString(domain)
}
