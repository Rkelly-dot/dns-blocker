package main

import (
    "log"
    "time"

    "dns-blocker/blocklist"
    dnsserver "dns-blocker/dns"
)

func main() {
    bl := blocklist.New()

    // Load blocklist before accepting any queries.
    if err := bl.Load(); err != nil {
        log.Fatalf("Failed to load blocklist: %v", err)
    }

    // Start the DNS server, passing in the loaded blocklist.
    bl.StartAutoReload(24 * time.Hour)
    dnsserver.Start(bl)
}