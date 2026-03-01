package canvas

import (
	"encoding/base64"
	"fmt"
	"sync"
	"sync/atomic"
	"time"
)

type Canvas struct {
	mu       sync.RWMutex
	Width    int
	Height   int
	Stickers []*Sticker
	nextID   uint64
}

func New(width, height int) *Canvas {
	return &Canvas{
		Width:    width,
		Height:   height,
		Stickers: make([]*Sticker, 0),
	}
}

func (c *Canvas) AddSticker(imageData []byte, width, height int) uint64 {
	id := atomic.AddUint64(&c.nextID, 1)

	s := &Sticker{
		ID:        id,
		Width:     width,
		Height:    height,
		PlacedAt:  time.Now(),
		ImageData: imageData,
		ScrapeMask: make([]byte, width*height),
	}
	// Initialize mask to fully opaque
	for i := range s.ScrapeMask {
		s.ScrapeMask[i] = 255
	}

	c.mu.Lock()
	c.Stickers = append(c.Stickers, s)
	c.mu.Unlock()

	return id
}

func (c *Canvas) PlaceSticker(id uint64, x, y int) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	s := c.findSticker(id)
	if s == nil {
		return fmt.Errorf("sticker %d not found", id)
	}

	s.X = x
	s.Y = y
	return nil
}

func (c *Canvas) FinalizeSticker(id uint64, rotation float64) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	s := c.findSticker(id)
	if s == nil {
		return fmt.Errorf("sticker %d not found", id)
	}
	if s.Finalized {
		return fmt.Errorf("sticker %d already finalized", id)
	}

	s.Rotation = rotation
	s.Finalized = true
	return nil
}

func (c *Canvas) GetSticker(id uint64) *Sticker {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.findSticker(id)
}

func (c *Canvas) findSticker(id uint64) *Sticker {
	for _, s := range c.Stickers {
		if s.ID == id {
			return s
		}
	}
	return nil
}

// StickerState is the JSON representation of a sticker for client consumption.
type StickerState struct {
	ID        uint64   `json:"id"`
	X         int      `json:"x"`
	Y         int      `json:"y"`
	Width     int      `json:"width"`
	Height    int      `json:"height"`
	Rotation  float64  `json:"rotation"`
	Finalized bool     `json:"finalized"`
	PlacedAt  string   `json:"placedAt"`
	ImageData string   `json:"imageData"`
	ScrapeMask []RLERun `json:"scrapeMask,omitempty"`
}

// CanvasState is the full state snapshot sent to new clients.
type CanvasState struct {
	Stickers []StickerState `json:"stickers"`
}

func (c *Canvas) Snapshot() CanvasState {
	c.mu.RLock()
	defer c.mu.RUnlock()

	state := CanvasState{
		Stickers: make([]StickerState, 0, len(c.Stickers)),
	}

	for _, s := range c.Stickers {
		ss := StickerState{
			ID:        s.ID,
			X:         s.X,
			Y:         s.Y,
			Width:     s.Width,
			Height:    s.Height,
			Rotation:  s.Rotation,
			Finalized: s.Finalized,
			PlacedAt:  s.PlacedAt.Format(time.RFC3339),
			ImageData: base64.StdEncoding.EncodeToString(s.ImageData),
		}

		// Only include scrape mask if sticker has been scraped
		if s.ScrapeMask != nil {
			allFull := true
			for _, v := range s.ScrapeMask {
				if v != 255 {
					allFull = false
					break
				}
			}
			if !allFull {
				ss.ScrapeMask = EncodeRLE(s.ScrapeMask)
			}
		}

		state.Stickers = append(state.Stickers, ss)
	}

	return state
}
