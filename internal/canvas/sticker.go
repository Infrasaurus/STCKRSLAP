package canvas

import (
	"math"
	"time"
)

type Sticker struct {
	ID         uint64    `json:"id"`
	X          int       `json:"x"`
	Y          int       `json:"y"`
	Width      int       `json:"width"`
	Height     int       `json:"height"`
	Rotation   float64   `json:"rotation"`
	Finalized  bool      `json:"finalized"`
	PlacedAt   time.Time `json:"placedAt"`
	ImageData  []byte    `json:"-"`
	ScrapeMask []byte    `json:"-"`
}

// WorldToLocal transforms world coordinates into sticker-local coordinates,
// accounting for rotation around the sticker center.
func (s *Sticker) WorldToLocal(wx, wy float64) (int, int) {
	// Translate to sticker-center-relative
	cx := float64(s.X) + float64(s.Width)/2
	cy := float64(s.Y) + float64(s.Height)/2
	dx := wx - cx
	dy := wy - cy

	// Inverse rotation
	if s.Rotation != 0 {
		cos := math.Cos(-s.Rotation)
		sin := math.Sin(-s.Rotation)
		ndx := dx*cos - dy*sin
		ndy := dx*sin + dy*cos
		dx = ndx
		dy = ndy
	}

	// Translate to top-left-relative
	lx := int(dx + float64(s.Width)/2)
	ly := int(dy + float64(s.Height)/2)
	return lx, ly
}

// ContainsWorld checks if world coordinates fall within the sticker bounds.
func (s *Sticker) ContainsWorld(wx, wy float64) bool {
	lx, ly := s.WorldToLocal(wx, wy)
	return lx >= 0 && lx < s.Width && ly >= 0 && ly < s.Height
}

// RLERun represents a run-length encoded segment.
type RLERun struct {
	Value byte   `json:"value"`
	Count uint32 `json:"count"`
}

// EncodeRLE encodes a byte slice as run-length encoded data.
func EncodeRLE(data []byte) []RLERun {
	if len(data) == 0 {
		return nil
	}

	runs := []RLERun{}
	current := data[0]
	count := uint32(1)

	for i := 1; i < len(data); i++ {
		if data[i] == current && count < math.MaxUint32 {
			count++
		} else {
			runs = append(runs, RLERun{Value: current, Count: count})
			current = data[i]
			count = 1
		}
	}
	runs = append(runs, RLERun{Value: current, Count: count})

	return runs
}
