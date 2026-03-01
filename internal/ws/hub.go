package ws

import (
	"encoding/json"
	"log"
	"sync"

	"github.com/infrasaurus/stckrslap/internal/canvas"
)

type Hub struct {
	canvas     *canvas.Canvas
	mu         sync.RWMutex
	clients    map[*Client]bool
	register   chan *Client
	unregister chan *Client
}

func NewHub(c *canvas.Canvas) *Hub {
	return &Hub{
		canvas:     c,
		clients:    make(map[*Client]bool),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
			log.Printf("Client connected (%d total)", h.clientCount())

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			h.mu.Unlock()
			log.Printf("Client disconnected (%d total)", h.clientCount())
		}
	}
}

func (h *Hub) clientCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

func (h *Hub) Broadcast(msg interface{}) {
	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("Failed to marshal broadcast: %v", err)
		return
	}

	h.mu.RLock()
	defer h.mu.RUnlock()

	for client := range h.clients {
		select {
		case client.send <- data:
		default:
			log.Printf("Dropping message for slow client (buffer full, msg size: %d bytes)", len(data))
		}
	}
}

func (h *Hub) SendTo(client *Client, msg interface{}) {
	data, err := json.Marshal(msg)
	if err != nil {
		log.Printf("Failed to marshal message: %v", err)
		return
	}

	select {
	case client.send <- data:
	default:
	}
}

func (h *Hub) Canvas() *canvas.Canvas {
	return h.canvas
}
