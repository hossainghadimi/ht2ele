package main

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

var releasePattern = regexp.MustCompile(`^HTML2Elementor-Windows-v(\d+(?:\.\d+)*)\.zip$`)

func versionLess(a, b string) bool {
	aa := releasePattern.FindStringSubmatch(a)
	bb := releasePattern.FindStringSubmatch(b)
	if len(aa) < 2 {
		return true
	}
	if len(bb) < 2 {
		return false
	}
	av, bv := strings.Split(aa[1], "."), strings.Split(bb[1], ".")
	n := len(av)
	if len(bv) > n {
		n = len(bv)
	}
	for i := 0; i < n; i++ {
		x, y := 0, 0
		if i < len(av) {
			x, _ = strconv.Atoi(av[i])
		}
		if i < len(bv) {
			y, _ = strconv.Atoi(bv[i])
		}
		if x != y {
			return x < y
		}
	}
	return false
}

func releaseRoutes(mux *http.ServeMux, dirs []string) {
	paths := func() map[string]string {
		result := map[string]string{}
		for _, dir := range dirs {
			entries, _ := os.ReadDir(dir)
			for _, e := range entries {
				if !e.IsDir() && strings.HasSuffix(strings.ToLower(e.Name()), ".zip") && strings.HasPrefix(e.Name(), "HTML2Elementor-") {
					result[e.Name()] = filepath.Join(dir, e.Name())
				}
			}
		}
		return result
	}
	latest := func(files map[string]string) string {
		names := []string{}
		for n := range files {
			if releasePattern.MatchString(n) {
				names = append(names, n)
			}
		}
		sort.Slice(names, func(i, j int) bool { return versionLess(names[i], names[j]) })
		if len(names) == 0 {
			return ""
		}
		return names[len(names)-1]
	}
	archive := "HTML2Elementor-All-Versions-through-v" + version + ".zip"
	mux.HandleFunc("/api/release", func(w http.ResponseWriter, r *http.Request) {
		files := paths()
		name := latest(files)
		info := map[string]interface{}{"app": "html2elementor", "download": name != ""}
		if name != "" {
			info["file"] = name
			info["version"] = releasePattern.FindStringSubmatch(name)[1]
			info["url"] = "/download/windows.zip"
			if st, e := os.Stat(files[name]); e == nil {
				info["bytes"] = st.Size()
			}
		}
		info["archive_url"] = "/versions.html"
		if files[archive] != "" {
			info["archive_url"] = "/download/versions.zip"
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(info)
	})
	mux.HandleFunc("/api/releases", func(w http.ResponseWriter, r *http.Request) {
		files := paths()
		names := []string{}
		for n := range files {
			names = append(names, n)
		}
		sort.Strings(names)
		records := []map[string]interface{}{}
		for _, n := range names {
			st, e := os.Stat(files[n])
			if e == nil {
				records = append(records, map[string]interface{}{"file": n, "bytes": st.Size(), "url": "/download/history/" + n})
			}
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(records)
	})
	mux.HandleFunc("/download/", func(w http.ResponseWriter, r *http.Request) {
		files := paths()
		name := filepath.Base(r.URL.Path)
		if name == "windows.zip" {
			name = latest(files)
		} else if name == "versions.zip" {
			name = archive
		}
		path := files[name]
		if path == "" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/zip")
		w.Header().Set("Content-Disposition", `attachment; filename="`+name+`"`)
		http.ServeFile(w, r, path)
	})
}

func localReleaseDirs() []string {
	exe, _ := os.Executable()
	base := filepath.Dir(exe)
	dirs := []string{base, filepath.Join(base, "versions"), filepath.Dir(base), filepath.Join(filepath.Dir(base), "versions")}
	if folder := os.Getenv("H2E_VERSIONS"); folder != "" {
		dirs = append(dirs, folder, filepath.Dir(folder))
	}
	return dirs
}
