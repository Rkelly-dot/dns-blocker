package dns

import (
	"io"
	"log"
	"net/http"

	"github.com/miekg/dns"
)

func DoHHandler(w http.ResponseWriter, req *http.Request) {
	if req.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	body, err := io.ReadAll(req.Body)
	if err != nil {
		http.Error(w, "failed to read body", http.StatusBadRequest)
		return
	}

	query := new(dns.Msg)
	if err := query.Unpack(body); err != nil {
		log.Printf("DoH: failed to parse query: %v", err)
		http.Error(w, "malformed dns message", http.StatusBadRequest)
		return
	}

	response := Resolve(query)
	if response == nil {
		http.Error(w, "no response", http.StatusInternalServerError)
		return
	}

	packed, err := response.Pack()
	if err != nil {
		log.Printf("DoH: failed to pack response: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/dns-message")
	w.WriteHeader(http.StatusOK)
	w.Write(packed)
}

func StartDoH(addr, certFile, keyFile string) {
	mux := http.NewServeMux()
	mux.HandleFunc("/dns-query", DoHHandler)

	log.Printf("DoH server listening on %s (HTTPS)", addr)

	if err := http.ListenAndServeTLS(addr, certFile, keyFile, mux); err != nil {
		log.Fatalf("Failed to start DoH server: %v", err)
	}
}