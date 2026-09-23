package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAIRejectsCrossOriginCommands(t *testing.T) {
	mux := http.NewServeMux()
	aiRoutes(mux)
	for _, origin := range []string{"https://evil.example", "null"} {
		r := httptest.NewRequest("POST", "http://localhost:7788/api/ai/models/start", strings.NewReader(`{}`))
		r.Header.Set("Origin", origin)
		r.Header.Set("X-H2E-Client", "1")
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		mux.ServeHTTP(w, r)
		if w.Code != 403 {
			t.Fatal(w.Code)
		}
	}
	r := httptest.NewRequest("POST", "http://localhost:7788/api/ai/train", strings.NewReader(`{}`))
	w := httptest.NewRecorder()
	mux.ServeHTTP(w, r)
	if w.Code != 403 {
		t.Fatal(w.Code)
	}
}
