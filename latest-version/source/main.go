package main

import (
	"context"
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"syscall"
	"time"
)

const version = "1.8.0"

//go:embed all:web
var webRoot embed.FS

func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	_ = cmd.Start()
}

func main() {
	initConsole()

	sub, err := fs.Sub(webRoot, "web")
	if err != nil {
		fatalf("embed: %v", err)
	}

	addr := "127.0.0.1:7788"
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		// Already running — just reopen the UI.
		openBrowser("http://127.0.0.1:7788/")
		fmt.Println("HTML2Elementor is already running. Reopened the browser.")
		fmt.Println("برنامه از قبل باز است؛ مرورگر دوباره باز شد.")
		time.Sleep(800 * time.Millisecond)
		return
	}

	srv := &http.Server{Handler: newMux(sub)}
	url := "http://" + ln.Addr().String() + "/"

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	go func() {
		if err := srv.Serve(ln); err != nil && err != http.ErrServerClosed {
			fatalf("server: %v", err)
		}
	}()

	fmt.Println("========================================================")
	fmt.Println("  HTML2Elementor  v" + version)
	fmt.Println("  " + url)
	fmt.Println("  Keep this window open. Closing it quits the app.")
	fmt.Println("  این پنجره را باز بگذارید. بستن پنجره = خروج")
	fmt.Println("========================================================")

	time.AfterFunc(400*time.Millisecond, func() { openBrowser(url) })

	<-stop
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
}

func newMux(web fs.FS) http.Handler {
	mux := http.NewServeMux()
	aiRoutes(mux)
	files := http.FileServer(http.FS(web))
	releaseRoutes(mux, localReleaseDirs())

	mux.HandleFunc("/api/ping", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(map[string]string{
			"app":     "desktop",
			"version": version,
		})
	})

	var shutting bool
	mux.HandleFunc("/api/shutdown", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_, _ = w.Write([]byte(`{"ok":true}`))
		if shutting {
			return
		}
		shutting = true
		go func() {
			time.Sleep(250 * time.Millisecond)
			os.Exit(0)
		}()
	})

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		files.ServeHTTP(w, r)
	})
	return mux
}

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
