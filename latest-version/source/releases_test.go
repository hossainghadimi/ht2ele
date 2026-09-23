package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestReleaseDownload(t *testing.T) {
	dir := t.TempDir()
	for _, name := range []string{"HTML2Elementor-Windows-v1.2.1.zip", "HTML2Elementor-Windows-v1.3.0.zip", "HTML2Elementor-Windows-v1.10.0.zip"} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte("zip-test"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	mux := http.NewServeMux()
	releaseRoutes(mux, []string{dir})
	rr := httptest.NewRecorder()
	mux.ServeHTTP(rr, httptest.NewRequest("GET", "/api/release", nil))
	if rr.Code != 200 || !strings.Contains(rr.Body.String(), "1.10.0") {
		t.Fatal(rr.Body.String())
	}
	for _, method := range []string{"GET", "HEAD"} {
		rr = httptest.NewRecorder()
		mux.ServeHTTP(rr, httptest.NewRequest(method, "/download/windows.zip", nil))
		if rr.Code != 200 || !strings.Contains(rr.Header().Get("Content-Disposition"), "1.10.0") {
			t.Fatal(rr)
		}
		if method == "HEAD" && rr.Body.Len() != 0 {
			t.Fatal("HEAD sent body")
		}
	}
	rr = httptest.NewRecorder()
	mux.ServeHTTP(rr, httptest.NewRequest("GET", "/download/nonexistent.zip", nil))
	if rr.Code != 404 {
		t.Fatal(rr.Code)
	}
}
