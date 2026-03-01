package upload

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"image"
	"image/png"
	"io"
	"math"
	"net/http"

	"github.com/infrasaurus/stckrslap/internal/canvas"
)

type UploadResponse struct {
	ID        uint64 `json:"id"`
	Width     int    `json:"width"`
	Height    int    `json:"height"`
	ImageData string `json:"imageData"`
	Resized   bool   `json:"resized,omitempty"`
}

// maxUploadSize is the raw upload limit — generous since we'll resize server-side.
const maxUploadSize = 50 * 1024 * 1024 // 50MB

func Handler(cv *canvas.Canvas, maxDim, canvasW, canvasH int, maxFileSize int64) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)

		if err := r.ParseMultipartForm(32 << 20); err != nil {
			http.Error(w, "file too large (max 50MB)", http.StatusBadRequest)
			return
		}

		file, _, err := r.FormFile("sticker")
		if err != nil {
			http.Error(w, "missing sticker file", http.StatusBadRequest)
			return
		}
		defer file.Close()

		data, err := io.ReadAll(file)
		if err != nil {
			http.Error(w, "failed to read file", http.StatusBadRequest)
			return
		}

		// Decode and validate format
		img, _, err := decodeImage(data)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		// Downscale for dimension limits (canvas % and hard pixel cap)
		img, resized := resizeIfNeeded(img, maxDim, canvasW, canvasH)

		// Encode to PNG and enforce file size limit
		pngData, img, sizeResized, err := encodePNGWithSizeLimit(img, maxFileSize)
		if err != nil {
			http.Error(w, "failed to encode image", http.StatusInternalServerError)
			return
		}
		if sizeResized {
			resized = true
		}

		bounds := img.Bounds()
		id := cv.AddSticker(pngData, bounds.Dx(), bounds.Dy())

		resp := UploadResponse{
			ID:        id,
			Width:     bounds.Dx(),
			Height:    bounds.Dy(),
			ImageData: base64.StdEncoding.EncodeToString(pngData),
			Resized:   resized,
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}
}

// encodePNGWithSizeLimit encodes the image as PNG. If the result exceeds
// maxSize bytes, it iteratively downscales until it fits.
func encodePNGWithSizeLimit(img image.Image, maxSize int64) ([]byte, image.Image, bool, error) {
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil, nil, false, err
	}

	if int64(buf.Len()) <= maxSize {
		return buf.Bytes(), img, false, nil
	}

	// Iteratively scale down by estimating the needed reduction from the
	// ratio of current size to target size. PNG size roughly scales with
	// pixel count, so we scale dimensions by sqrt(targetSize/currentSize).
	resized := false
	for int64(buf.Len()) > maxSize {
		resized = true
		ratio := math.Sqrt(float64(maxSize) / float64(buf.Len()))
		// Be slightly aggressive to avoid many iterations
		ratio *= 0.9

		bounds := img.Bounds()
		newW := int(float64(bounds.Dx()) * ratio)
		newH := int(float64(bounds.Dy()) * ratio)
		if newW < 1 {
			newW = 1
		}
		if newH < 1 {
			newH = 1
		}

		img = downscale(img, newW, newH)

		buf.Reset()
		if err := png.Encode(&buf, img); err != nil {
			return nil, nil, false, err
		}
	}

	return buf.Bytes(), img, resized, nil
}
