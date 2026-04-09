package consts

import "time"

const (
	CookingActiveKeyFmt = "cooking:active:v1:%d"
	MaxActiveCooking    = 10
	CookingKeyTTL       = 30 * 24 * time.Hour
)
