package dns

import (
    "fmt"
    "log"
    "strings"
    "time"

    "github.com/miekg/dns"
    "dns-blocker/blocklist"
)

var bl *blocklist.List

// Resolve is the core decision logic, with no transport concerns at all.
// It takes a parsed query and returns a parsed response.
// Both the UDP server and the future DoH HTTP handler call this same function.
func Resolve(r *dns.Msg) *dns.Msg {
    if len(r.Question) == 0 {
        return nil
    }

    question := r.Question[0]
    if question.Name == "" {
        return nil
    }

    normalized := strings.ToLower(question.Name)

    if strings.Contains(normalized, "spotify") {
        log.Printf("[SPOTIFY] Query: %s", normalized)
    } else {
        fmt.Printf("Query: %-40s type=%d\n", question.Name, question.Qtype)
    }

    if bl.IsBlocked(normalized) {
        return buildBlockedResponse(r)
    }

    return buildForwardedResponse(r)
}

// buildBlockedResponse constructs an NXDOMAIN reply. No I/O — just builds the message.
func buildBlockedResponse(r *dns.Msg) *dns.Msg {
    m := new(dns.Msg)
    m.SetReply(r)
    m.SetRcode(r, dns.RcodeNameError)

    log.Printf("Blocked: %s", r.Question[0].Name)
    return m
}

// buildForwardedResponse sends the query to 1.1.1.1 and returns whatever comes back.
// If forwarding fails, it builds a SERVFAIL response instead of returning nil.
func buildForwardedResponse(r *dns.Msg) *dns.Msg {
    c := &dns.Client{
        Net:     "udp",
        Timeout: 5 * time.Second, // explicit timeout, don't rely on default
    }

    resp, _, err := c.Exchange(r, "1.1.1.1:53")
    if err != nil {
        log.Printf("Forward error: %v", err)
        m := new(dns.Msg)
        m.SetReply(r)
        m.SetRcode(r, dns.RcodeServerFailure)
        return m
    }

    return resp
}

// Handler is the UDP/TCP transport adapter. It unwraps the incoming
// query, calls Resolve, and writes the result back over UDP.
func Handler(w dns.ResponseWriter, r *dns.Msg) {
    resp := Resolve(r)
    if resp == nil {
        return
    }
    w.WriteMsg(resp)
}

// Start launches the DNS server on UDP port 53 (or :5454 in dev).
func Start(list *blocklist.List) {
    bl = list

    dns.HandleFunc(".", Handler)

    server := &dns.Server{
        Addr: ":5454",
        Net:  "udp",
    }

    log.Println("DNS server listening on UDP :5454")

    if err := server.ListenAndServe(); err != nil {
        log.Fatalf("Failed to start DNS server: %v", err)
    }
}