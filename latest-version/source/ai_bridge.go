package main

import (
	"bufio"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

var aiOnce sync.Once
var aiProxy *httputil.ReverseProxy
var aiFailure = "AI service unavailable"

func initAI() {
	exe, _ := os.Executable()
	base := filepath.Dir(exe)
	python := filepath.Join(base, "runtime", "python.exe")
	script := filepath.Join(base, "ai", "service.py")
	if _, e := os.Stat(python); e != nil {
		aiFailure = "Runtime missing: extract the complete ZIP including runtime, ai and engine folders."
		return
	}
	raw := make([]byte, 32)
	if _, e := rand.Read(raw); e != nil {
		aiFailure = e.Error()
		return
	}
	token := hex.EncodeToString(raw)
	cmd := exec.Command(python, script, "--token", token, "--parent", strconv.Itoa(os.Getpid()))
	cmd.Dir = base
	cmd.Env = append(os.Environ(), "PYTHONUTF8=1")
	pipe, e := cmd.StdoutPipe()
	if e != nil {
		aiFailure = e.Error()
		return
	}
	cmd.Stderr = os.Stderr
	if e = cmd.Start(); e != nil {
		aiFailure = e.Error()
		return
	}
	ch := make(chan string, 1)
	go func() {
		s := bufio.NewScanner(pipe)
		if s.Scan() {
			ch <- s.Text()
		} else {
			ch <- ""
		}
	}()
	var port string
	select {
	case port = <-ch:
	case <-time.After(15 * time.Second):
		cmd.Process.Kill()
		aiFailure = "AI startup timed out"
		return
	}
	n, e := strconv.Atoi(strings.TrimSpace(port))
	if e != nil || n < 1 || n > 65535 {
		cmd.Process.Kill()
		aiFailure = "AI startup failed. See console."
		return
	}
	target, _ := url.Parse(fmt.Sprintf("http://127.0.0.1:%d", n))
	p := httputil.NewSingleHostReverseProxy(target)
	old := p.Director
	p.Director = func(r *http.Request) { old(r); r.Header.Set("X-H2E-Token", token) }
	p.ErrorHandler = func(w http.ResponseWriter, r *http.Request, e error) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(503)
		json.NewEncoder(w).Encode(map[string]string{"error": "AI service stopped. Restart the application."})
	}
	aiProxy = p
	go cmd.Wait()
}
func aiRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/ai/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" && r.Method != "POST" {
			http.Error(w, "Method not allowed", 405)
			return
		}
		if r.Method == "POST" {
			origin := r.Header.Get("Origin")
			if origin != "" {
				u, e := url.Parse(origin)
				if e != nil || u.Host != r.Host {
					http.Error(w, "Cross-origin request rejected", 403)
					return
				}
			}
			if r.Header.Get("X-H2E-Client") != "1" || !strings.HasPrefix(r.Header.Get("Content-Type"), "application/json") {
				http.Error(w, "JSON client header required", 403)
				return
			}
			r.Body = http.MaxBytesReader(w, r.Body, 12000000)
		}
		aiOnce.Do(initAI)
		if aiProxy == nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(503)
			json.NewEncoder(w).Encode(map[string]string{"error": aiFailure})
			return
		}
		aiProxy.ServeHTTP(w, r)
	})
}
