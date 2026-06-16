package blocklist

import (
    "bufio"
    "log"
    "net/http"
    "strings"
    "sync"
)

// List holds the blocked domains and a lock to protect concurrent access.
// The lock is needed because the DNS handler reads the map constantly
// while the reload goroutine may be writing a new map every 24 hours.
// Learn more: https://pkg.go.dev/sync#RWMutex
type List struct {
    mu      sync.RWMutex
    domains map[string]struct{}
}

// New creates an empty List.
func New() *List {
    return &List{
        domains: make(map[string]struct{}),
    }
}

// IsBlocked returns true if the domain is in the blocklist.
// It acquires a read lock — multiple goroutines can read simultaneously.
func (l *List) IsBlocked(domain string) bool {
    // DNS domains have a trailing dot internally e.g. "google.com."
    // We strip it before checking so our map keys are clean.
    domain = strings.TrimSuffix(domain, ".")

    l.mu.RLock()
    defer l.mu.RUnlock()

    _, blocked := l.domains[domain]
    return blocked
}

// Load downloads the StevenBlack hosts file and parses it into the map.
func (l *List) Load() error {
    url := "https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts"
    log.Printf("Downloading blocklist from %s ...", url)

    resp, err := http.Get(url)
    if err != nil {
        return err
    }
    defer resp.Body.Close()

    // Parse the file line by line.
    newDomains := make(map[string]struct{})
    scanner := bufio.NewScanner(resp.Body)

    for scanner.Scan() {
        line := scanner.Text()

        // Skip comments and empty lines.
        if strings.HasPrefix(line, "#") || line == "" {
            continue
        }

        // Each valid line looks like: "0.0.0.0 doubleclick.net"
        // strings.Fields splits on any whitespace and handles extra spaces.
        fields := strings.Fields(line)
        if len(fields) < 2 {
            continue
        }

        // fields[0] is "0.0.0.0", fields[1] is the domain.
        domain := fields[1]

        // Skip the localhost entry that appears in every hosts file.
        if domain == "localhost" {
            continue
        }

        newDomains[domain] = struct{}{}
    }

    // Swap the old map for the new one under a write lock.
    // The write lock waits for all active reads to finish before swapping.
    l.mu.Lock()
    l.domains = newDomains
    l.mu.Unlock()

    log.Printf("Blocklist loaded: %d domains", len(newDomains))
    return nil
}