package ws

import (
	"encoding/json"

	"github.com/infrasaurus/stckrslap/internal/canvas"
)

// Incoming message types
const (
	MsgPlace    = "place"
	MsgFinalize = "finalize"
	MsgScrape   = "scrape"
)

// Outgoing message types
const (
	MsgStickerPlaced    = "sticker_placed"
	MsgStickerFinalized = "sticker_finalized"
	MsgScrapeApplied    = "scrape_applied"
	MsgFullState        = "full_state"
	MsgError            = "error"
)

// IncomingMessage is the envelope for all client-to-server messages.
type IncomingMessage struct {
	Type string          `json:"type"`
	Raw  json.RawMessage `json:"-"`
}

// UnmarshalJSON custom unmarshals to capture the raw message.
func (m *IncomingMessage) UnmarshalJSON(data []byte) error {
	type alias struct {
		Type string `json:"type"`
	}
	var a alias
	if err := json.Unmarshal(data, &a); err != nil {
		return err
	}
	m.Type = a.Type
	m.Raw = data
	return nil
}

// PlaceMessage is sent when a client places a sticker.
type PlaceMessage struct {
	Type string `json:"type"`
	ID   uint64 `json:"id"`
	X    int    `json:"x"`
	Y    int    `json:"y"`
}

// FinalizeMessage is sent when a client commits a sticker rotation.
type FinalizeMessage struct {
	Type     string  `json:"type"`
	ID       uint64  `json:"id"`
	Rotation float64 `json:"rotation"`
}

// ScrapeMessage is sent when a client performs a scrape interaction.
type ScrapeMessage struct {
	Type        string               `json:"type"`
	Path        []canvas.ScrapePoint `json:"path"`
	BrushRadius int                  `json:"brushRadius"`
}

// OutgoingMessage is a generic outgoing message.
type OutgoingMessage struct {
	Type string `json:"type"`
}

// StickerPlacedMessage is broadcast when a sticker is placed.
type StickerPlacedMessage struct {
	Type      string `json:"type"`
	ID        uint64 `json:"id"`
	X         int    `json:"x"`
	Y         int    `json:"y"`
	Width     int    `json:"width"`
	Height    int    `json:"height"`
	ImageData string `json:"imageData"`
	PlacedAt  string `json:"placedAt"`
}

// StickerFinalizedMessage is broadcast when a sticker rotation is committed.
type StickerFinalizedMessage struct {
	Type     string  `json:"type"`
	ID       uint64  `json:"id"`
	Rotation float64 `json:"rotation"`
}

// ScrapeAppliedMessage is broadcast when scrape results are computed.
type ScrapeAppliedMessage struct {
	Type    string                `json:"type"`
	Updates []canvas.ScrapeResult `json:"updates"`
}

// ErrorMessage is sent to a single client on validation error.
type ErrorMessage struct {
	Type    string `json:"type"`
	Message string `json:"message"`
}
