package store

import (
	"sync"
	"time"
)

type QueryEntry struct {
	Domain    string    `json:"domain"`
	Blocked   bool      `json:"blocked"`
	Timestamp time.Time `json:"timestamp"`
}

type QueryLog struct {
	mu       sync.RWMutex
	entries  []QueryEntry
	capacity int
	head     int 
	count    int 

func NewQueryLog(capacity int) *QueryLog {
	return &QueryLog{
		entries:  make([]QueryEntry, capacity),
		capacity: capacity,
	}
}

func (ql *QueryLog) Add(domain string, blocked bool) {
	ql.mu.Lock()
	defer ql.mu.Unlock()

	ql.entries[ql.head] = QueryEntry{
		Domain:    domain,
		Blocked:   blocked,
		Timestamp: time.Now(),
	}

	ql.head = (ql.head + 1) % ql.capacity

	if ql.count < ql.capacity {
		ql.count++
	}
}

func (ql *QueryLog) Entries() []QueryEntry {
	ql.mu.RLock()
	defer ql.mu.RUnlock()

	if ql.count == 0 {
		return []QueryEntry{}
	}

	result := make([]QueryEntry, ql.count)

	if ql.count < ql.capacity {
		copy(result, ql.entries[:ql.count])
	} else {
		n := copy(result, ql.entries[ql.head:])
		copy(result[n:], ql.entries[:ql.head])
	}

	return result
}

func (ql *QueryLog) Stats() (total int, blocked int) {
	ql.mu.RLock()
	defer ql.mu.RUnlock()

	total = ql.count
	for i := 0; i < ql.count; i++ {
		if ql.entries[i].Blocked {
			blocked++
		}
	}
	return
}