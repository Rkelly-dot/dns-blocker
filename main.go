package main

import (
	"errors"
	"log"
	"os"
	"time"

	"github.com/joho/godotenv"

	"dns-blocker/api"
	"dns-blocker/blocklist"
	dnsserver "dns-blocker/dns"
	"dns-blocker/store"
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

	apiServer := api.New(ql, bl)
	go apiServer.Start(":8080")

	go dnsserver.StartDoH(":443", "cert.pem", "key.pem")

	dnsserver.Start(bl, ql)
}