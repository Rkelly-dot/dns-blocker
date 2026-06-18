package main

import (
    "log"
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
    dnsserver.Start(bl)
}