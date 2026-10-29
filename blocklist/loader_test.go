package blocklist

import "testing"

func TestManualRulesMatchSubdomains(t *testing.T) {
	l := New()

	l.AddManual("example.com")
	if !l.IsBlocked("example.com") {
		t.Fatal("exact domain should be blocked")
	}
	if !l.IsBlocked("ads.example.com.") {
		t.Fatal("subdomain with trailing dot should be blocked")
	}
	if l.IsBlocked("notexample.com") {
		t.Fatal("unrelated suffix should not match")
	}

	// A more specific allow rule punches a hole; siblings stay blocked.
	l.AddAllow("safe.example.com")
	if l.IsBlocked("safe.example.com") {
		t.Fatal("allow rule should override the parent block")
	}
	if !l.IsBlocked("other.example.com") {
		t.Fatal("allow rule should not affect sibling domains")
	}

	l.RemoveAllow("safe.example.com")
	if !l.IsBlocked("safe.example.com") {
		t.Fatal("removing the allow rule should restore the parent block")
	}

	l.RemoveManual("example.com")
	if l.IsBlocked("example.com") {
		t.Fatal("removed block rule should stop matching")
	}
}

func TestSizeCountsManualBlocks(t *testing.T) {
	l := New()
	l.domains["feed.example"] = struct{}{}
	l.AddManual("manual.example")
	if got := l.Size(); got != 2 {
		t.Fatalf("Size() = %d, want 2", got)
	}
}
