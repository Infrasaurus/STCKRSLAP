package ws

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"nhooyr.io/websocket"

	"github.com/infrasaurus/stckrslap/internal/canvas"
)

const (
	writeTimeout   = 30 * time.Second
	readLimit      = 64 * 1024 // 64KB max message size
	sendBufSize    = 64
	scrapeCooldown = 60 * time.Second
)

type Client struct {
	hub          *Hub
	conn         *websocket.Conn
	send         chan []byte
	lastScrapeAt time.Time
}

func HandleWS(hub *Hub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{
			InsecureSkipVerify: true, // Allow any origin (behind reverse proxy)
		})
		if err != nil {
			log.Printf("WebSocket accept error: %v", err)
			return
		}

		conn.SetReadLimit(readLimit)

		client := &Client{
			hub:  hub,
			conn: conn,
			send: make(chan []byte, sendBufSize),
		}

		hub.register <- client

		go client.writePump(r.Context())
		client.readPump(r.Context())
	}
}

func (c *Client) readPump(ctx context.Context) {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close(websocket.StatusNormalClosure, "")
	}()

	for {
		_, data, err := c.conn.Read(ctx)
		if err != nil {
			if websocket.CloseStatus(err) != websocket.StatusNormalClosure {
				log.Printf("Read error: %v", err)
			}
			return
		}

		var msg IncomingMessage
		if err := json.Unmarshal(data, &msg); err != nil {
			c.sendError("invalid message format")
			continue
		}

		c.handleMessage(msg)
	}
}

func (c *Client) writePump(ctx context.Context) {
	for {
		select {
		case msg, ok := <-c.send:
			if !ok {
				return
			}
			writeCtx, cancel := context.WithTimeout(ctx, writeTimeout)
			err := c.conn.Write(writeCtx, websocket.MessageText, msg)
			cancel()
			if err != nil {
				return
			}
		case <-ctx.Done():
			return
		}
	}
}

func (c *Client) handleMessage(msg IncomingMessage) {
	switch msg.Type {
	case MsgPlace:
		c.handlePlace(msg.Raw)
	case MsgFinalize:
		c.handleFinalize(msg.Raw)
	case MsgScrape:
		c.handleScrape(msg.Raw)
	default:
		c.sendError("unknown message type: " + msg.Type)
	}
}

func (c *Client) handlePlace(raw json.RawMessage) {
	var msg PlaceMessage
	if err := json.Unmarshal(raw, &msg); err != nil {
		c.sendError("invalid place message")
		return
	}

	cv := c.hub.Canvas()
	s := cv.GetSticker(msg.ID)
	if s == nil {
		c.sendError("sticker not found")
		return
	}

	if err := cv.PlaceSticker(msg.ID, msg.X, msg.Y); err != nil {
		c.sendError(err.Error())
		return
	}

	// Refresh sticker state after placement
	s = cv.GetSticker(msg.ID)

	// Schedule auto-finalize after 60 seconds
	go func() {
		time.Sleep(60 * time.Second)
		if err := cv.FinalizeSticker(msg.ID, 0); err == nil {
			c.hub.Broadcast(StickerFinalizedMessage{
				Type:     MsgStickerFinalized,
				ID:       msg.ID,
				Rotation: 0,
			})
		}
	}()

	// Broadcast to all clients
	c.hub.Broadcast(StickerPlacedMessage{
		Type:      MsgStickerPlaced,
		ID:        s.ID,
		X:         s.X,
		Y:         s.Y,
		Width:     s.Width,
		Height:    s.Height,
		ImageData: base64.StdEncoding.EncodeToString(s.ImageData),
		PlacedAt:  s.PlacedAt.Format(time.RFC3339),
	})
}

func (c *Client) handleFinalize(raw json.RawMessage) {
	var msg FinalizeMessage
	if err := json.Unmarshal(raw, &msg); err != nil {
		c.sendError("invalid finalize message")
		return
	}

	cv := c.hub.Canvas()
	if err := cv.FinalizeSticker(msg.ID, msg.Rotation); err != nil {
		c.sendError(err.Error())
		return
	}

	c.hub.Broadcast(StickerFinalizedMessage{
		Type:     MsgStickerFinalized,
		ID:       msg.ID,
		Rotation: msg.Rotation,
	})
}

func (c *Client) handleScrape(raw json.RawMessage) {
	var msg ScrapeMessage
	if err := json.Unmarshal(raw, &msg); err != nil {
		c.sendError("invalid scrape message")
		return
	}

	// Rate limit
	if time.Since(c.lastScrapeAt) < scrapeCooldown {
		c.sendError("scrape cooldown active")
		return
	}
	c.lastScrapeAt = time.Now()

	cv := c.hub.Canvas()
	evt := canvas.ScrapeEvent{
		Path:        msg.Path,
		BrushRadius: msg.BrushRadius,
	}

	results := cv.ApplyScrape(evt)
	if len(results) > 0 {
		c.hub.Broadcast(ScrapeAppliedMessage{
			Type:    MsgScrapeApplied,
			Updates: results,
		})
	}
}

func (c *Client) sendError(message string) {
	c.hub.SendTo(c, ErrorMessage{
		Type:    MsgError,
		Message: message,
	})
}
