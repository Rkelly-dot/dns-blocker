package blocklist

import (
    "bufio"
    "log"
    "net/http"
    "strings"
    "sync"
)

type List struct {
    mu      sync.RWMutex
    domains map[string]struct{}
}

func New() *List {
    return &List{
        domains: make(map[string]struct{}),
    }
}

func (l *List) IsBlocked(domain string) bool {
    domain = strings.TrimSuffix(domain, ".")

    l.mu.RLock()
    defer l.mu.RUnlock()

    _, blocked := l.domains[domain]
    return blocked
}

func (l *List) Load() error {
    url := "https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts"
    log.Printf("Downloading blocklist from %s ...", url)

    resp, err := http.Get(url)
    if err != nil {
        return err
    }
    defer resp.Body.Close()

    newDomains := make(map[string]struct{})
    scanner := bufio.NewScanner(resp.Body)

    for scanner.Scan() {
        line := scanner.Text()

        if strings.HasPrefix(line, "#") || line == "" {
            continue
        }

        fields := strings.Fields(line)
        if len(fields) < 2 {
            continue
        }

        // fields[0] is "0.0.0.0", fields[1] is the domain.
        domain := fields[1]

        if domain == "localhost" {
            continue
        }

        newDomains[domain] = struct{}{}
    }

    l.mu.Lock()
    l.domains = newDomains
    l.mu.Unlock()

    log.Printf("Blocklist loaded: %d domains", len(newDomains))
    return nil
}