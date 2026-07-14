package main

import (
	"log"
	"time"

	"dns-blocker/blocklist"
	dnsserver "dns-blocker/dns"
	"dns-blocker/store"
)

func main() {
	bl := blocklist.New()

	if err := bl.Load(); err != nil {
		log.Fatalf("Failed to load blocklist: %v", err)
	}

	bl.StartAutoReload(24 * time.Hour)

	ql := store.NewQueryLog(1000)

	go dnsserver.StartDoH(":8443", "cert.pem", "key.pem")

	dnsserver.Start(bl, ql)
}