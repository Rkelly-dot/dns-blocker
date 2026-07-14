package dns

import (
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/miekg/dns"
	"dns-blocker/blocklist"
	"dns-blocker/store"
)

var bl *blocklist.List
var queryLog *store.QueryLog

// Start now takes both the blocklist and the query log.
func Start(list *blocklist.List, ql *store.QueryLog) {
	bl = list
	queryLog = ql

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

// Resolve is the core decision logic — no transport concerns.
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

	blocked := bl.IsBlocked(normalized)

	// Log every query to the ring buffer.
	if queryLog != nil {
		queryLog.Add(strings.TrimSuffix(normalized, "."), blocked)
	}

	if blocked {
		return buildBlockedResponse(r)
	}

	return buildForwardedResponse(r)
}

func buildBlockedResponse(r *dns.Msg) *dns.Msg {
	m := new(dns.Msg)
	m.SetReply(r)
	m.SetRcode(r, dns.RcodeNameError)
	log.Printf("Blocked: %s", r.Question[0].Name)
	return m
}

func buildForwardedResponse(r *dns.Msg) *dns.Msg {
	c := &dns.Client{
		Net:     "udp",
		Timeout: 5 * time.Second,
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

func Handler(w dns.ResponseWriter, r *dns.Msg) {
	resp := Resolve(r)
	if resp == nil {
		return
	}
	w.WriteMsg(resp)
}