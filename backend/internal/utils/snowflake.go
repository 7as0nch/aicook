package utils

import (
	"net"
	"strconv"
	"strings"
	"time"

	"github.com/bwmarrin/snowflake"
)

var node *snowflake.Node

const base62Alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"

func init() {
	// Use a custom epoch to keep generated IDs shorter.
	start := time.Date(2025, 1, 1, 0, 0, 0, 0, time.UTC)
	snowflake.Epoch = start.UnixMilli()

	workerID := resolveWorkerID()
	generator, err := snowflake.NewNode(workerID)
	if err != nil {
		panic(err)
	}
	node = generator
}

func resolveWorkerID() int64 {
	ips, err := net.LookupHost("localhost")
	if err != nil || len(ips) == 0 {
		return 1
	}
	parsed := net.ParseIP(ips[0])
	if parsed == nil || parsed.To4() == nil {
		return 1
	}
	parts := strings.Split(parsed.To4().String(), ".")
	if len(parts) != 4 {
		return 1
	}
	last, convErr := strconv.Atoi(parts[3])
	if convErr != nil || last <= 0 {
		return 1
	}
	return int64(last)
}

func GetSFID() int64 {
	return node.Generate().Int64()
}

func ToBase62(id int64) string {
	if id == 0 {
		return "0"
	}
	negative := id < 0
	var num uint64
	if negative {
		// Avoid overflow for MinInt64.
		num = uint64(-(id + 1))
		num++
	} else {
		num = uint64(id)
	}

	buf := make([]byte, 0, 12)
	for num > 0 {
		buf = append(buf, base62Alphabet[num%62])
		num /= 62
	}
	if negative {
		buf = append(buf, '-')
	}
	for i, j := 0, len(buf)-1; i < j; i, j = i+1, j-1 {
		buf[i], buf[j] = buf[j], buf[i]
	}
	return string(buf)
}

func GetSFIDBase62() string {
	return ToBase62(GetSFID())
}

func Base62ToSFID(base62 string) int64 {
	if base62 == "" {
		return 0
	}

	negative := false
	chars := []byte(base62)
	if chars[0] == '-' {
		negative = true
		chars = chars[1:]
	}

	var num uint64
	for _, c := range chars {
		var val int
		switch {
		case c >= '0' && c <= '9':
			val = int(c - '0')
		case c >= 'a' && c <= 'z':
			val = int(c-'a') + 10
		case c >= 'A' && c <= 'Z':
			val = int(c-'A') + 36
		default:
			return 0
		}
		num = num*62 + uint64(val)
	}

	if negative {
		if num == 0 {
			return 0
		}
		return -(int64(num) - 1) - 1
	}
	return int64(num)
}
