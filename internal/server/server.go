package server

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/infrasaurus/stckrslap/internal/canvas"
	"github.com/infrasaurus/stckrslap/internal/upload"
	"github.com/infrasaurus/stckrslap/internal/ws"
)

type Server struct {
	cfg    Config
	canvas *canvas.Canvas
	hub    *ws.Hub
	mux    *http.ServeMux
}

func New(cfg Config, cv *canvas.Canvas, hub *ws.Hub) *Server {
	s := &Server{
		cfg:    cfg,
		canvas: cv,
		hub:    hub,
		mux:    http.NewServeMux(),
	}
	s.routes()
	return s
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.mux.ServeHTTP(w, r)
}

func (s *Server) routes() {
	// Static files — no auth required
	fs := http.FileServer(http.Dir("static"))
	s.mux.Handle("/static/", http.StripPrefix("/static/", fs))

	// API routes — auth required
	s.mux.Handle("/api/upload", s.authMiddleware(
		http.HandlerFunc(upload.Handler(s.canvas, s.cfg.MaxStickerDim, s.cfg.CanvasWidth, s.cfg.CanvasHeight, s.cfg.MaxFileSize)),
	))

	s.mux.Handle("/api/state", s.authMiddleware(
		http.HandlerFunc(s.stateHandler),
	))

	// WebSocket — auth required
	s.mux.Handle("/ws", s.authMiddleware(
		http.HandlerFunc(ws.HandleWS(s.hub)),
	))

	// Index page — handles invite key in path
	s.mux.HandleFunc("/", s.serveIndex)
}

func (s *Server) serveIndex(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/")
	path = strings.TrimSuffix(path, "/")

	// If invite key is configured, validate it from the URL path
	if s.cfg.InviteKey != "" {
		if path == "" {
			http.Error(w, "invite key required", http.StatusForbidden)
			return
		}
		if path != s.cfg.InviteKey {
			http.Error(w, "invalid invite key", http.StatusForbidden)
			return
		}
		// Set cookie so API/WS requests can use it
		http.SetCookie(w, &http.Cookie{
			Name:     "stckrslap_key",
			Value:    s.cfg.InviteKey,
			Path:     "/",
			SameSite: http.SameSiteStrictMode,
		})
	}

	http.ServeFile(w, r, "static/index.html")
}

func (s *Server) stateHandler(w http.ResponseWriter, r *http.Request) {
	state := s.canvas.Snapshot()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(state)
}
