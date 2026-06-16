package dns

import (
    "fmt"
    "log"

    "github.com/miekg/dns"
)

// Handler is called by miekg/dns every time a query arrives.
// w is how you write the response back.
// r is the incoming query, already parsed from raw UDP bytes.
func Handler(w dns.ResponseWriter, r *dns.Msg) {
    if len(r.Question) == 0 {
        return
    }

    question := r.Question[0]

    fmt.Printf("Query: %-40s type=%d\n", question.Name, question.Qtype)

    forward(w, r)
}

// forward sends the query to 1.1.1.1 and relays the response back to the device.
func forward(w dns.ResponseWriter, r *dns.Msg) {
    // dns.Client is miekg's UDP client for sending queries upstream.
    c := new(dns.Client)

    // Exchange sends the query and waits for the response.
    // "1.1.1.1:53" is Cloudflare's public DNS resolver.
    resp, _, err := c.Exchange(r, "1.1.1.1:53")
    if err != nil {
        log.Printf("Forward error: %v", err)
        return
    }

    // Write the upstream response back to the device that asked.
    // miekg handles copying the query ID into the response automatically.
    w.WriteMsg(resp)
}

// Start launches the DNS server on UDP port 53.
func Start() {
    dns.HandleFunc(".", Handler)

    server := &dns.Server{
        Addr: ":53",
        Net:  "udp",
    }

    log.Println("DNS server listening on UDP :53")

    // ListenAndServe blocks forever, handling queries in goroutines.
    if err := server.ListenAndServe(); err != nil {
        log.Fatalf("Failed to start DNS server: %v", err)
    }
}