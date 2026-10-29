package store

import (
	"database/sql"
	"path/filepath"
	"testing"

	_ "modernc.org/sqlite"
)

func TestRulesPersistAcrossReopen(t *testing.T) {
	path := filepath.Join(t.TempDir(), "rules.db")

	db, err := OpenRules(path)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if _, err := db.Upsert("ads.example.com", ActionBlock); err != nil {
		t.Fatalf("upsert block: %v", err)
	}
	if _, err := db.Upsert("cdn.example.net", ActionAllow); err != nil {
		t.Fatalf("upsert allow: %v", err)
	}
	// Upserting again changes the action but not the row count.
	if _, err := db.Upsert("ads.example.com", ActionAllow); err != nil {
		t.Fatalf("upsert update: %v", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("close: %v", err)
	}

	db, err = OpenRules(path)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	defer db.Close()

	rules, err := db.List()
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(rules) != 2 {
		t.Fatalf("want 2 rules, got %d", len(rules))
	}
	for _, rule := range rules {
		if rule.Domain == "ads.example.com" && rule.Action != ActionAllow {
			t.Fatalf("ads.example.com action = %q, want allow", rule.Action)
		}
		if rule.CreatedAt.IsZero() {
			t.Fatalf("rule %q has no creation time", rule.Domain)
		}
	}

	deleted, err := db.Delete("cdn.example.net")
	if err != nil || !deleted {
		t.Fatalf("delete: deleted=%v err=%v", deleted, err)
	}
	if _, err := db.Upsert("bad.example.org", "drop"); err == nil {
		t.Fatal("expected invalid action to be rejected")
	}
}

func TestRulesMigrateLegacySchema(t *testing.T) {
	path := filepath.Join(t.TempDir(), "rules.db")

	// This is the table shape written by the first rules build.
	legacy, err := sql.Open("sqlite", "file:"+path)
	if err != nil {
		t.Fatalf("open legacy: %v", err)
	}
	if _, err := legacy.Exec(`CREATE TABLE rules (
		domain TEXT PRIMARY KEY,
		action TEXT NOT NULL CHECK(action IN ('block','allow'))
	)`); err != nil {
		t.Fatalf("create legacy table: %v", err)
	}
	if _, err := legacy.Exec(`INSERT INTO rules (domain, action) VALUES ('legacy.example.com', 'block')`); err != nil {
		t.Fatalf("insert legacy row: %v", err)
	}
	if err := legacy.Close(); err != nil {
		t.Fatalf("close legacy: %v", err)
	}

	db, err := OpenRules(path)
	if err != nil {
		t.Fatalf("open legacy database: %v", err)
	}
	defer db.Close()

	rules, err := db.List()
	if err != nil {
		t.Fatalf("list after migration: %v", err)
	}
	if len(rules) != 1 || rules[0].Domain != "legacy.example.com" || rules[0].Action != ActionBlock {
		t.Fatalf("unexpected migrated rules: %+v", rules)
	}
	if rules[0].CreatedAt.IsZero() {
		t.Fatal("migration did not backfill created_at")
	}

	// New writes must keep working on the migrated table.
	if _, err := db.Upsert("new.example.com", ActionAllow); err != nil {
		t.Fatalf("upsert after migration: %v", err)
	}
	if rules, err = db.List(); err != nil || len(rules) != 2 {
		t.Fatalf("list after upsert: %v, %+v", err, rules)
	}
}

func TestNormalizeDomain(t *testing.T) {
	cases := map[string]string{
		"  Example.COM. ": "example.com",
		"example.com.":    "example.com",
		"example.com":     "example.com",
	}
	for input, want := range cases {
		if got := NormalizeDomain(input); got != want {
			t.Fatalf("NormalizeDomain(%q) = %q, want %q", input, got, want)
		}
	}
}
