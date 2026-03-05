package upload

import (
	"bytes"
	"fmt"
	"image"
	"image/draw"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"net/http"

	_ "golang.org/x/image/webp"
)

// decodeImage validates the format and decodes the image data.
func decodeImage(data []byte) (image.Image, string, error) {
	contentType := http.DetectContentType(data)

	switch contentType {
	case "image/png", "image/jpeg", "image/webp", "image/gif":
		// OK
	default:
		return nil, "", fmt.Errorf("unsupported image format: %s", contentType)
	}

	img, format, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, "", fmt.Errorf("failed to decode image: %w", err)
	}

	bounds := img.Bounds()
	if bounds.Dx() == 0 || bounds.Dy() == 0 {
		return nil, "", fmt.Errorf("image has zero dimension")
	}

	return img, format, nil
}

// validateGIFDimensions checks that the GIF dimensions are within limits.
// Unlike static images, GIFs cannot be resized so we reject if too large.
func validateGIFDimensions(width, height, maxDim, canvasW, canvasH int) error {
	threshW := float64(canvasW) * 0.33
	threshH := float64(canvasH) * 0.33

	if float64(width) > threshW {
		return fmt.Errorf("animated GIF is too wide (%dpx, max %dpx) — GIFs cannot be resized", width, int(threshW))
	}
	if float64(height) > threshH {
		return fmt.Errorf("animated GIF is too tall (%dpx, max %dpx) — GIFs cannot be resized", height, int(threshH))
	}
	if width > maxDim {
		return fmt.Errorf("animated GIF is too wide (%dpx, max %dpx) — GIFs cannot be resized", width, maxDim)
	}
	if height > maxDim {
		return fmt.Errorf("animated GIF is too tall (%dpx, max %dpx) — GIFs cannot be resized", height, maxDim)
	}
	return nil
}

// resizeIfNeeded downscales the image if it exceeds 33% of either canvas
// dimension, scaling it down so the offending dimension(s) fit within 20%
// of the canvas. Also enforces the hard maxDim pixel limit (4096).
// Aspect ratio is always preserved; the most restrictive constraint wins.
func resizeIfNeeded(img image.Image, maxDim, canvasW, canvasH int) (image.Image, bool) {
	bounds := img.Bounds()
	w := bounds.Dx()
	h := bounds.Dy()

	scale := 1.0

	// Canvas-relative limit: if width > 33% of canvas width, scale to 20%
	threshW := float64(canvasW) * 0.33
	if float64(w) > threshW {
		s := (float64(canvasW) * 0.20) / float64(w)
		if s < scale {
			scale = s
		}
	}

	// Canvas-relative limit: if height > 33% of canvas height, scale to 20%
	threshH := float64(canvasH) * 0.33
	if float64(h) > threshH {
		s := (float64(canvasH) * 0.20) / float64(h)
		if s < scale {
			scale = s
		}
	}

	// Hard pixel limit per dimension
	if w > maxDim {
		s := float64(maxDim) / float64(w)
		if s < scale {
			scale = s
		}
	}
	if h > maxDim {
		s := float64(maxDim) / float64(h)
		if s < scale {
			scale = s
		}
	}

	if scale >= 1.0 {
		return img, false
	}

	newW := int(float64(w) * scale)
	newH := int(float64(h) * scale)
	if newW < 1 {
		newW = 1
	}
	if newH < 1 {
		newH = 1
	}

	return downscale(img, newW, newH), true
}

// downscale uses area averaging for high-quality downscaling.
func downscale(src image.Image, dstW, dstH int) image.Image {
	srcBounds := src.Bounds()
	srcW := srcBounds.Dx()
	srcH := srcBounds.Dy()

	// Convert source to NRGBA for uniform pixel access
	nrgba := image.NewNRGBA(srcBounds)
	draw.Draw(nrgba, srcBounds, src, srcBounds.Min, draw.Src)

	dst := image.NewNRGBA(image.Rect(0, 0, dstW, dstH))

	xRatio := float64(srcW) / float64(dstW)
	yRatio := float64(srcH) / float64(dstH)

	for dy := 0; dy < dstH; dy++ {
		srcY0 := float64(dy) * yRatio
		srcY1 := float64(dy+1) * yRatio

		for dx := 0; dx < dstW; dx++ {
			srcX0 := float64(dx) * xRatio
			srcX1 := float64(dx+1) * xRatio

			// Average all source pixels in this destination pixel's area
			var rSum, gSum, bSum, aSum float64
			var count float64

			iy0 := int(srcY0)
			iy1 := int(srcY1)
			if iy1 == int(srcY0) {
				iy1++
			}
			ix0 := int(srcX0)
			ix1 := int(srcX1)
			if ix1 == int(srcX0) {
				ix1++
			}

			for sy := iy0; sy < iy1 && sy < srcH; sy++ {
				for sx := ix0; sx < ix1 && sx < srcW; sx++ {
					off := (sy-srcBounds.Min.Y)*nrgba.Stride + (sx-srcBounds.Min.X)*4
					rSum += float64(nrgba.Pix[off+0])
					gSum += float64(nrgba.Pix[off+1])
					bSum += float64(nrgba.Pix[off+2])
					aSum += float64(nrgba.Pix[off+3])
					count++
				}
			}

			if count > 0 {
				off := dy*dst.Stride + dx*4
				dst.Pix[off+0] = uint8(rSum / count)
				dst.Pix[off+1] = uint8(gSum / count)
				dst.Pix[off+2] = uint8(bSum / count)
				dst.Pix[off+3] = uint8(aSum / count)
			}
		}
	}

	return dst
}
