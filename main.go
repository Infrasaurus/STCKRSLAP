package main

import (
	"fmt"
	"log"
	"net/http"

	"github.com/infrasaurus/stckrslap/internal/canvas"
	"github.com/infrasaurus/stckrslap/internal/server"
	"github.com/infrasaurus/stckrslap/internal/ws"
)

func main() {
	cfg := server.ParseConfig()

	cv := canvas.New(cfg.CanvasWidth, cfg.CanvasHeight)
	hub := ws.NewHub(cv)
	go hub.Run()

	srv := server.New(cfg, cv, hub)

	addr := fmt.Sprintf(":%d", cfg.Port)
	log.Printf("STCKRSLAP listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, srv))
}
