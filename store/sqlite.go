package store

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

// A Rule is a domain the user has explicitly decided about.
// Action is either "block" or "allow"; allow wins over anything the
// downloaded blocklists say.
type Rule struct {
	Domain    string    `json:"domain"`
	Action    string    `json:"action"`
	CreatedAt time.Time `json:"created_at"`
}

const (
	ActionBlock = "block"
	ActionAllow = "allow"
)

// RuleStore persists rules in a small SQLite database. It is safe for
// concurrent use: database/sql pools the underlying connections.
type RuleStore struct {
	db *sql.DB
}

// OpenRules opens (and creates if needed) the rules database at path.
func OpenRules(path string) (*RuleStore, error) {
	dsn := "file:" + path + "?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open rules db: %w", err)
	}

	// SQLite writes are serialised anyway; a single connection avoids
	// lock contention between pooled connections.
	db.SetMaxOpenConns(1)

	if _, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS rules (
			domain     TEXT PRIMARY KEY,
			action     TEXT NOT NULL CHECK (action IN ('block', 'allow')),
			created_at TEXT NOT NULL
		)`); err != nil {
		db.Close()
		return nil, fmt.Errorf("create rules table: %w", err)
	}

	if err := migrateSchema(db); err != nil {
		db.Close()
		return nil, err
	}

	return &RuleStore{db: db}, nil
}

// migrateSchema upgrades databases written by earlier builds. The first
// version of the rules table had no created_at column, and CREATE TABLE
// IF NOT EXISTS leaves such a table exactly as it was.
func migrateSchema(db *sql.DB) error {
	rows, err := db.Query(`PRAGMA table_info(rules)`)
	if err != nil {
		return fmt.Errorf("inspect rules table: %w", err)
	}
	defer rows.Close()

	columns := make(map[string]bool)
	for rows.Next() {
		var (
			cid       int
			name      string
			colType   string
			notNull   int
			dfltValue sql.NullString
			pk        int
		)
		if err := rows.Scan(&cid, &name, &colType, &notNull, &dfltValue, &pk); err != nil {
			return fmt.Errorf("inspect rules table: %w", err)
		}
		columns[name] = true
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("inspect rules table: %w", err)
	}

	if !columns["domain"] {
		return fmt.Errorf("rules table has no domain column; refusing to guess a migration")
	}

	if !columns["action"] {
		if _, err := db.Exec(`ALTER TABLE rules ADD COLUMN action TEXT NOT NULL DEFAULT 'block'`); err != nil {
			return fmt.Errorf("add action column: %w", err)
		}
	}

	if !columns["created_at"] {
		if _, err := db.Exec(`ALTER TABLE rules ADD COLUMN created_at TEXT NOT NULL DEFAULT ''`); err != nil {
			return fmt.Errorf("add created_at column: %w", err)
		}
		if _, err := db.Exec(`UPDATE rules SET created_at = ? WHERE created_at = ''`,
			time.Now().UTC().Format(time.RFC3339Nano)); err != nil {
			return fmt.Errorf("backfill created_at: %w", err)
		}
	}

	return nil
}

// Close releases the database handle.
func (s *RuleStore) Close() error {
	return s.db.Close()
}

// List returns every rule, newest first.
func (s *RuleStore) List() ([]Rule, error) {
	rows, err := s.db.Query(`SELECT domain, action, created_at FROM rules ORDER BY created_at DESC, domain ASC`)
	if err != nil {
		return nil, fmt.Errorf("list rules: %w", err)
	}
	defer rows.Close()

	rules := make([]Rule, 0)
	for rows.Next() {
		var (
			rule    Rule
			created string
		)
		if err := rows.Scan(&rule.Domain, &rule.Action, &created); err != nil {
			return nil, fmt.Errorf("scan rule: %w", err)
		}
		rule.CreatedAt, _ = time.Parse(time.RFC3339Nano, created)
		rules = append(rules, rule)
	}
	return rules, rows.Err()
}

// Upsert inserts a rule or changes the action of an existing one.
// The original creation time is kept when updating.
func (s *RuleStore) Upsert(domain, action string) (Rule, error) {
	if action != ActionBlock && action != ActionAllow {
		return Rule{}, fmt.Errorf("invalid action %q", action)
	}

	created := time.Now().UTC()
	_, err := s.db.Exec(`
		INSERT INTO rules (domain, action, created_at) VALUES (?, ?, ?)
		ON CONFLICT(domain) DO UPDATE SET action = excluded.action`,
		domain, action, created.Format(time.RFC3339Nano))
	if err != nil {
		return Rule{}, fmt.Errorf("upsert rule: %w", err)
	}

	var stored string
	if err := s.db.QueryRow(
		`SELECT created_at FROM rules WHERE domain = ?`, domain,
	).Scan(&stored); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Rule{}, fmt.Errorf("rule %q vanished after upsert", domain)
		}
		return Rule{}, fmt.Errorf("read rule: %w", err)
	}

	rule := Rule{Domain: domain, Action: action}
	rule.CreatedAt, _ = time.Parse(time.RFC3339Nano, stored)
	return rule, nil
}

// Delete removes a rule. It reports whether a row was actually deleted.
func (s *RuleStore) Delete(domain string) (bool, error) {
	res, err := s.db.Exec(`DELETE FROM rules WHERE domain = ?`, domain)
	if err != nil {
		return false, fmt.Errorf("delete rule: %w", err)
	}
	n, err := res.RowsAffected()
	if err != nil {
		return false, err
	}
	return n > 0, nil
}

// NormalizeDomain lowercases a domain and strips surrounding noise so
// "  Example.COM. " and "example.com" refer to the same rule.
func NormalizeDomain(domain string) string {
	return strings.TrimSuffix(strings.ToLower(strings.TrimSpace(domain)), ".")
}
