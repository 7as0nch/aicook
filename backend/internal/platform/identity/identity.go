package identity

import (
	"net/http"
	"strconv"
)

var (
	DefaultHouseholdID int64 = 202503240000001001
	DefaultUserID      int64 = 202503240000001002
)

func HouseholdID(r *http.Request) int64 {
	if raw := r.Header.Get("X-Household-ID"); raw != "" {
		if parsed, err := strconv.ParseInt(raw, 10, 64); err == nil {
			return parsed
		}
	}
	return DefaultHouseholdID
}

func UserID(r *http.Request) int64 {
	if raw := r.Header.Get("X-User-ID"); raw != "" {
		if parsed, err := strconv.ParseInt(raw, 10, 64); err == nil {
			return parsed
		}
	}
	return DefaultUserID
}
