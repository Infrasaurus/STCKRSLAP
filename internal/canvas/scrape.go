package canvas

import (
	"math"
)

type ScrapePoint struct {
	X        float64 `json:"x"`
	Y        float64 `json:"y"`
	Pressure float64 `json:"pressure"`
}

type ScrapeEvent struct {
	Path        []ScrapePoint `json:"path"`
	BrushRadius int           `json:"brushRadius"`
}

type ScrapeResult struct {
	StickerID uint64   `json:"stickerId"`
	Mask      []RLERun `json:"mask"`
}

func (c *Canvas) ApplyScrape(evt ScrapeEvent) []ScrapeResult {
	c.mu.Lock()
	defer c.mu.Unlock()

	modified := map[uint64]bool{}

	// Interpolate path for continuous brush stroke
	fullPath := interpolatePath(evt.Path)

	for _, pt := range fullPath {
		// Try each sticker from top z-index down
		for i := len(c.Stickers) - 1; i >= 0; i-- {
			s := c.Stickers[i]
			if !s.Finalized {
				continue
			}

			// Check at main position and wrapped positions
			hit := false
			for _, ox := range []float64{0, float64(c.Width), -float64(c.Width)} {
				lx, ly := s.WorldToLocal(pt.X+ox, pt.Y)
				if lx >= 0 && lx < s.Width && ly >= 0 && ly < s.Height {
					idx := ly*s.Width + lx
					if s.ScrapeMask[idx] > 0 {
						applyBrush(s, lx, ly, evt.BrushRadius, pt.Pressure)
						modified[s.ID] = true
						hit = true
						break
					}
				}
			}
			if hit {
				break
			}
		}
	}

	// Build results with updated masks
	results := make([]ScrapeResult, 0, len(modified))
	for id := range modified {
		s := c.findSticker(id)
		if s != nil {
			results = append(results, ScrapeResult{
				StickerID: id,
				Mask:      EncodeRLE(s.ScrapeMask),
			})
		}
	}

	return results
}

func applyBrush(s *Sticker, cx, cy, radius int, pressure float64) {
	for dy := -radius; dy <= radius; dy++ {
		for dx := -radius; dx <= radius; dx++ {
			px, py := cx+dx, cy+dy
			if px < 0 || px >= s.Width || py < 0 || py >= s.Height {
				continue
			}

			dist := math.Sqrt(float64(dx*dx + dy*dy))
			if dist > float64(radius) {
				continue
			}

			falloff := 1.0 - (dist / float64(radius))
			reduction := byte(pressure * falloff * 40)
			idx := py*s.Width + px
			if s.ScrapeMask[idx] > reduction {
				s.ScrapeMask[idx] -= reduction
			} else {
				s.ScrapeMask[idx] = 0
			}
		}
	}
}

func interpolatePath(path []ScrapePoint) []ScrapePoint {
	if len(path) < 2 {
		return path
	}

	result := []ScrapePoint{path[0]}

	for i := 1; i < len(path); i++ {
		prev := path[i-1]
		curr := path[i]

		dx := curr.X - prev.X
		dy := curr.Y - prev.Y
		dist := math.Sqrt(dx*dx + dy*dy)

		// Insert interpolated points every 2 pixels
		steps := int(dist / 2)
		for j := 1; j < steps; j++ {
			t := float64(j) / float64(steps)
			result = append(result, ScrapePoint{
				X:        prev.X + dx*t,
				Y:        prev.Y + dy*t,
				Pressure: prev.Pressure + (curr.Pressure-prev.Pressure)*t,
			})
		}

		result = append(result, curr)
	}

	return result
}
