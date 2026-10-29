package blocklist

import (
	"bufio"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"
)

type List struct {
	mu sync.RWMutex

	// domains is the downloaded feed. It is replaced wholesale on reload.
	domains map[string]struct{}

	// manualBlocks and manualAllows hold user rules. They live in their own
	// maps so a blocklist reload can never discard them, and a manual allow
	// always beats a feed entry.
	manualBlocks map[string]struct{}
	manualAllows map[string]struct{}
}

func New() *List {
	return &List{
		domains:      make(map[string]struct{}),
		manualBlocks: make(map[string]struct{}),
		manualAllows: make(map[string]struct{}),
	}
}

// IsBlocked reports whether a query for domain should be refused. Manual
// allow rules are checked first so they can punch a hole in a downloaded
// blocklist entry for the domain or any of its subdomains.
func (l *List) IsBlocked(domain string) bool {
	domain = strings.TrimSuffix(domain, ".")
	domain = strings.ToLower(domain)

	l.mu.RLock()
	defer l.mu.RUnlock()

	if matchesSuffix(l.manualAllows, domain) {
		return false
	}
	if matchesSuffix(l.manualBlocks, domain) {
		return true
	}
	return matchesSuffix(l.domains, domain)
}

// matchesSuffix walks the domain and each parent domain until it finds a
// match or runs out of labels. Callers must hold at least a read lock.
func matchesSuffix(set map[string]struct{}, domain string) bool {
	for {
		if _, ok := set[domain]; ok {
			return true
		}
		idx := strings.Index(domain, ".")
		if idx == -1 {
			return false
		}
		domain = domain[idx+1:]
	}
}

// AddManual blocks a single domain. Manual rules are kept separately from
// the downloaded feeds and survive blocklist reloads.
func (l *List) AddManual(domain string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.manualAllows, domain)
	l.manualBlocks[domain] = struct{}{}
	log.Printf("Rule applied: block %s", domain)
}

// RemoveManual drops a manual block rule.
func (l *List) RemoveManual(domain string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.manualBlocks, domain)
	log.Printf("Rule removed: block %s", domain)
}

// AddAllow explicitly allows a domain, overriding any feed entry.
func (l *List) AddAllow(domain string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.manualBlocks, domain)
	l.manualAllows[domain] = struct{}{}
	log.Printf("Rule applied: allow %s", domain)
}

// RemoveAllow drops a manual allow rule.
func (l *List) RemoveAllow(domain string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.manualAllows, domain)
	log.Printf("Rule removed: allow %s", domain)
}

// Size returns the number of downloaded domains plus manual block rules.
func (l *List) Size() int {
	l.mu.RLock()
	defer l.mu.RUnlock()
	return len(l.domains) + len(l.manualBlocks)
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

	// OISD list has very long lines — increase the scanner buffer
	// to avoid "token too long" errors on large blocklists.
	buf := make([]byte, 1024*1024)
	scanner.Buffer(buf, 1024*1024)

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

func (l *List) StartAutoReload(interval time.Duration) {
	ticker := time.NewTicker(interval)

	go func() {
		for range ticker.C {
			log.Println("Auto-reload triggered, refreshing blocklist...")
			if err := l.Load(); err != nil {
				log.Printf("Auto-reload failed: %v", err)
			}
		}
	}()
}
