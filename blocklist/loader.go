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
    domain = strings.ToLower(domain)

    l.mu.RLock()
    defer l.mu.RUnlock()

    for {
        if _, blocked := l.domains[domain]; blocked {
            return true
        }
        idx := strings.Index(domain, ".")
        if idx == -1 {
            return false
        }
        domain = domain[idx+1:]
    }
}

var sources = []string{
    "https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts",
    "https://big.oisd.nl/domainswild",
}

func (l *List) Load() error {
    newDomains := make(map[string]struct{})

    for _, url := range sources {
        log.Printf("Downloading blocklist from %s ...", url)

        count, err := fetchAndParse(url, newDomains)
        if err != nil {
            log.Printf("Warning: failed to load %s: %v", url, err)
            continue
        }

        log.Printf("  -> %d domains added from this source", count)
    }

    l.mu.Lock()
    l.domains = newDomains
    l.mu.Unlock()

    log.Printf("Blocklist reload complete: %d total domains", len(newDomains))
    return nil
}

func fetchAndParse(url string, dest map[string]struct{}) (int, error) {
    resp, err := http.Get(url)
    if err != nil {
        return 0, err
    }
    defer resp.Body.Close()

    count := 0
    scanner := bufio.NewScanner(resp.Body)

    for scanner.Scan() {
        line := strings.TrimSpace(scanner.Text())

        if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, "!") {
            continue
        }

        fields := strings.Fields(line)
        if len(fields) == 0 {
            continue
        }

        var domain string

        if len(fields) >= 2 && (fields[0] == "0.0.0.0" || fields[0] == "127.0.0.1") {
            domain = fields[1]
        } else {
            domain = fields[0]
        }

        domain = strings.ToLower(domain)

        if domain == "" || domain == "localhost" {
            continue
        }

        dest[domain] = struct{}{}
        count++
    }

    return count, scanner.Err()
}