package dns

import (
    "fmt"
    "log"

    "github.com/miekg/dns"
    "dns-blocker/blocklist"
)

var bl *blocklist.List

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

func Handler(w dns.ResponseWriter, r *dns.Msg) {
    if len(r.Question) == 0 {
        return
    }

    question := r.Question[0]
    fmt.Printf("Query: %-40s type=%d\n", question.Name, question.Qtype)

    if bl.IsBlocked(question.Name) {
        block(w, r)
        return
    }

    forward(w, r)
}

func block(w dns.ResponseWriter, r *dns.Msg) {
    m := new(dns.Msg)

    m.SetReply(r)
    m.SetRcode(r, dns.RcodeNameError) // RcodeNameError = NXDOMAIN

    log.Printf("Blocked: %s", r.Question[0].Name)
    w.WriteMsg(m)
}

func forward(w dns.ResponseWriter, r *dns.Msg) {
    c := new(dns.Client)
    resp, _, err := c.Exchange(r, "1.1.1.1:53")
    if err != nil {
        log.Printf("Forward error: %v", err)
        return
    }
    w.WriteMsg(resp)
}