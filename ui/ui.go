// Package ui serves the dashboard built by Vite from web/.
package ui

import (
	"embed"
	"io/fs"
	"net/http"
	"path"
	"strings"
)

// The built dashboard is embedded so the project still ships as one binary.
// Run `npm run build` in web/ after changing anything under web/src.
//
//go:embed all:dist
var dist embed.FS

// Handler serves static assets and falls back to index.html for client-side
// routes such as /queries or /rules.
func Handler() http.Handler {
	root, err := fs.Sub(dist, "dist")
	if err != nil {
		panic(err)
	}

	index, err := fs.ReadFile(root, "index.html")
	if err != nil {
		panic("dashboard assets are missing from the binary: " + err.Error())
	}

	files := http.FileServer(http.FS(root))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "same-origin")

		name := strings.TrimPrefix(path.Clean(r.URL.Path), "/")
		if name == "" {
			serveIndex(w, r, index)
			return
		}

		f, err := root.Open(name)
		if err != nil {
			serveIndex(w, r, index)
			return
		}
		info, statErr := f.Stat()
		f.Close()
		if statErr != nil || info.IsDir() {
			serveIndex(w, r, index)
			return
		}

		// Vite fingerprints everything under assets/, so it can be cached hard.
		if strings.HasPrefix(name, "assets/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		}
		files.ServeHTTP(w, r)
	})
}

func serveIndex(w http.ResponseWriter, r *http.Request, index []byte) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	if r.Method == http.MethodHead {
		w.WriteHeader(http.StatusOK)
		return
	}
	w.Write(index)
}
