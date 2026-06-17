package conf

import (
	"context"
	"fmt"
	"os"
	"regexp"
	"strings"
	"sync"

	"github.com/go-kratos/kratos/v2/config"
	_ "github.com/go-kratos/kratos/v2/encoding/yaml" // 注册 yaml 解码器，供下方 bytesSource 使用
	"gopkg.in/yaml.v3"
)

// envPlaceholder 匹配 ${VAR}（大写字母/下划线开头）形式的占位符。
// 仅匹配带花括号的占位，避免误伤配置值里的裸 $（如某些密码）。
var envPlaceholder = regexp.MustCompile(`\$\{([A-Z_][A-Z0-9_]*)\}`)

// expandEnvPlaceholders 把 ${VAR} 替换为对应环境变量的值（由 k8s Secret 注入）。
// 未设置的占位原样保留——本地直接写明文配置时不含占位符，因此是无副作用的 no-op。
func expandEnvPlaceholders(raw []byte) []byte {
	return envPlaceholder.ReplaceAllFunc(raw, func(m []byte) []byte {
		name := string(envPlaceholder.FindSubmatch(m)[1])
		if v, ok := os.LookupEnv(name); ok {
			return []byte(v)
		}
		return m
	})
}

// findUnexpandedPlaceholders 返回展开后仍残留的 ${VAR} 占位名（去重、保序）。
func findUnexpandedPlaceholders(raw []byte) []string {
	seen := map[string]bool{}
	var names []string
	for _, m := range envPlaceholder.FindAllSubmatch(raw, -1) {
		name := string(m[1])
		if !seen[name] {
			seen[name] = true
			names = append(names, name)
		}
	}
	return names
}

func LoadBootstrap(path string) (*Bootstrap, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	// 先做 ${VAR} 注入，再喂给 Kratos 与下面的 embedding 解析，两处用同一份展开后的字节。
	expanded := expandEnvPlaceholders(raw)

	// 展开后若仍残留 ${VAR}，说明对应环境变量没注入（k8s Secret 缺键 / 本地没设）。
	// 直接报错好过把占位符当成密码/密钥静默用下去，导致后续难懂的连接/鉴权失败。
	if missing := findUnexpandedPlaceholders(expanded); len(missing) > 0 {
		return nil, fmt.Errorf("配置存在未注入的占位符（缺少对应环境变量/Secret 键）: %s", strings.Join(missing, ", "))
	}

	c := config.New(
		config.WithSource(&bytesSource{key: path, value: expanded}),
		// 关掉 Kratos 自带的 ${key} 解析器：我们已在上面用环境变量做了 ${VAR} 注入，
		// 避免 Kratos 二次解析把未注入的占位悄悄变成空串、或误伤已展开值里的 ${}。
		config.WithResolver(func(map[string]any) error { return nil }),
	)
	defer c.Close()

	if err := c.Load(); err != nil {
		return nil, err
	}

	var bc Bootstrap
	if err := c.Scan(&bc); err != nil {
		return nil, err
	}
	if err := bindEmbeddingFromBytes(expanded, &bc); err != nil {
		return nil, err
	}
	return &bc, nil
}

func (c *PGDatabase) DSN() string {
	if c == nil {
		return ""
	}

	schema := c.GetSchema()
	if schema == "" {
		schema = "public"
	}
	return fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=%s search_path=%s",
		c.GetHost(),
		c.GetPort(),
		c.GetUser(),
		c.GetPassword(),
		c.GetDbname(),
		c.GetSslmode(),
		schema,
	)
}

type bootstrapConfigExtras struct {
	AI *aiConfigExtras `yaml:"ai"`
}

type aiConfigExtras struct {
	Embedding *EmbeddingSettings `yaml:"embedding"`
}

// bindEmbeddingFromBytes 解析嵌套的 ai.embedding（Kratos proto scan 不覆盖此结构），
// 直接复用已展开 ${VAR} 的字节，避免二次读盘。
func bindEmbeddingFromBytes(payload []byte, bc *Bootstrap) error {
	if bc == nil {
		return nil
	}
	var extras bootstrapConfigExtras
	if err := yaml.Unmarshal(payload, &extras); err != nil {
		return err
	}
	BindBootstrapEmbeddingSettings(bc, nil)
	if extras.AI == nil {
		return nil
	}
	BindBootstrapEmbeddingSettings(bc, extras.AI.Embedding)
	return nil
}

// bytesSource 是一个内存配置源：把已展开 ${VAR} 的字节作为 yaml 交给 Kratos，
// 这样密钥注入发生在解析之前，且不必把展开后的明文落盘。
type bytesSource struct {
	key   string
	value []byte
}

func (s *bytesSource) Load() ([]*config.KeyValue, error) {
	return []*config.KeyValue{{
		Key:    s.key,
		Value:  s.value,
		Format: "yaml",
	}}, nil
}

func (s *bytesSource) Watch() (config.Watcher, error) {
	return &staticWatcher{done: make(chan struct{})}, nil
}

// staticWatcher 永不触发变更；Stop 时解除阻塞让 Kratos 的 watch goroutine 正常退出。
type staticWatcher struct {
	done chan struct{}
	once sync.Once
}

func (w *staticWatcher) Next() ([]*config.KeyValue, error) {
	<-w.done
	// 返回 context.Canceled：Kratos 的 watch 循环只在该错误时干净退出 goroutine；
	// 返回其它错误会被它 sleep(1s)+Errorf+continue 无限重试，刷屏 "failed to watch next config"。
	return nil, context.Canceled
}

func (w *staticWatcher) Stop() error {
	w.once.Do(func() { close(w.done) })
	return nil
}
