package main

import (
	"errors"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/joho/godotenv"

	"dns-blocker/api"
	"dns-blocker/blocklist"
	dnsserver "dns-blocker/dns"
	"dns-blocker/store"
	"dns-blocker/ui"
)

func main() {
	if err := godotenv.Load(); err != nil && !errors.Is(err, os.ErrNotExist) {
		log.Fatalf("Failed to load .env: %v", err)
	}

	bl := blocklist.New()

	if err := bl.Load(); err != nil {
		log.Fatalf("Failed to load blocklist: %v", err)
	}

	bl.StartAutoReload(24 * time.Hour)

	ql := store.NewQueryLog(1000)

	rules, err := store.OpenRules(envOr("RULES_DB", "rules.db"))
	if err != nil {
		log.Fatalf("Failed to open rule store: %v", err)
	}
	defer rules.Close()

	saved, err := rules.List()
	if err != nil {
		log.Fatalf("Failed to read saved rules: %v", err)
	}
	for _, rule := range saved {
		if rule.Action == store.ActionAllow {
			bl.AddAllow(rule.Domain)
		} else {
			bl.AddManual(rule.Domain)
		}
	}
	log.Printf("Loaded %d saved rule(s)", len(saved))

	apiServer := api.New(ql, bl, rules)

	addr := envOr("API_ADDR", "127.0.0.1:8080")

	go func() {
		log.Printf("Dashboard listening on http://%s", addr)
		if err := http.ListenAndServe(addr, dashboardHandler(apiServer.Handler())); err != nil {
			log.Fatalf("Failed to start dashboard server: %v", err)
		}
	}()

	go dnsserver.StartDoH(":443", "cert.pem", "key.pem")

	dnsserver.Start(bl, ql)
}

// dashboardHandler puts the API, the same-origin dashboard API, and the
// embedded UI on one listener. The UI is the fallback so client-side routes
// such as /queries survive a hard refresh.
//
// Loopback is the default boundary; set API_ADDR to expose it on a network
// interface deliberately.
func dashboardHandler(apiHandler http.Handler) http.Handler {
	mux := http.NewServeMux()
	mux.Handle("/api/", apiHandler)
	mux.Handle("/dashboard/", apiHandler)
	mux.Handle("/", ui.Handler())
	return mux
}

// envOr returns the environment variable or a fallback when it is unset.
func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
