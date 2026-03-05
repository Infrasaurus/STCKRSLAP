package server

import (
	"os"
	"strconv"
)

type Config struct {
	Port          int
	InviteKey     string
	MaxFileSize   int64
	MaxStickerDim int
	CanvasWidth   int
	CanvasHeight  int
}

func ParseConfig() Config {
	cfg := Config{
		Port:          10014,
		InviteKey:     os.Getenv("INVITE_KEY"),
		MaxFileSize:   5 * 1024 * 1024,
		MaxStickerDim: 2048,
		CanvasWidth:   20000,
		CanvasHeight:  5000,
	}

	if p := os.Getenv("PORT"); p != "" {
		if v, err := strconv.Atoi(p); err == nil {
			cfg.Port = v
		}
	}

	return cfg
}
