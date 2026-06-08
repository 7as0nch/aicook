// Package logging 把 gocommon 的 zap 日志适配成 Kratos 的 log.Logger，
// 使全局日志（中间件、Helper、kratos.App）统一走 gocommon 的日志处理
// （控制台 + 文件，按天切割、压缩备份）。适配层只做 Kratos⇄zap 的桥接。
package logging

import (
	"fmt"
	"os"

	commonlog "github.com/7as0nch/gocommon/logger"
	"github.com/go-kratos/kratos/v2/log"
	"go.uber.org/zap"

	"github.com/chengjiang/aicook/backend/internal/conf"
)

// NewLogger 按配置构造 gocommon zap 日志，并包成 Kratos log.Logger。
func NewLogger(cfg *conf.Log) log.Logger {
	path := orDefault(cfg.GetPath(), "./logs")
	// gocommon 在初始化时会 os.Create 日志文件，需确保目录存在。
	_ = os.MkdirAll(path, 0o755)

	zl := commonlog.NewLogger(commonlog.LoggerConfig{
		Path:     path,
		FileName: orDefault(cfg.GetFilename(), "aicook.log"),
		Level:    orDefault(cfg.GetLevel(), "info"),
	})
	return &kratosLogger{zl: zl}
}

// kratosLogger 实现 kratos log.Logger，将 keyvals 映射为 zap 字段。
type kratosLogger struct {
	zl *zap.Logger
}

func (l *kratosLogger) Log(level log.Level, keyvals ...interface{}) error {
	if len(keyvals) == 0 {
		return nil
	}
	if len(keyvals)%2 != 0 {
		keyvals = append(keyvals, "KEYVALS_UNPAIRED")
	}

	var msg string
	fields := make([]zap.Field, 0, len(keyvals)/2)
	for i := 0; i < len(keyvals); i += 2 {
		key := fmt.Sprint(keyvals[i])
		if key == log.DefaultMessageKey { // "msg"
			msg = fmt.Sprint(keyvals[i+1])
			continue
		}
		fields = append(fields, zap.Any(key, keyvals[i+1]))
	}

	switch level {
	case log.LevelDebug:
		l.zl.Debug(msg, fields...)
	case log.LevelInfo:
		l.zl.Info(msg, fields...)
	case log.LevelWarn:
		l.zl.Warn(msg, fields...)
	case log.LevelError:
		l.zl.Error(msg, fields...)
	case log.LevelFatal:
		l.zl.Fatal(msg, fields...)
	default:
		l.zl.Info(msg, fields...)
	}
	return nil
}

func orDefault(v, def string) string {
	if v == "" {
		return def
	}
	return v
}
