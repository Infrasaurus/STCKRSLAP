package server

import (
	"net/http"
)

func (s *Server) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if s.cfg.InviteKey == "" {
			next.ServeHTTP(w, r)
			return
		}

		// Try query parameter first
		key := r.URL.Query().Get("key")

		// Then try cookie
		if key == "" {
			if c, err := r.Cookie("stckrslap_key"); err == nil {
				key = c.Value
			}
		}

		if key != s.cfg.InviteKey {
			http.Error(w, "invalid invite key", http.StatusForbidden)
			return
		}

		next.ServeHTTP(w, r)
	})
}
