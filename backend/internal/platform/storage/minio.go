package storage

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/url"
	"strings"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"

	"github.com/chengjiang/aicook/backend/internal/conf"
)

type ObjectStorage interface {
	EnsureBucket(ctx context.Context, bucket string) error
	PutObject(ctx context.Context, bucket, objectKey, contentType string, data []byte) (string, error)
	GetObject(ctx context.Context, bucket, objectKey string) ([]byte, error)
	PresignPutObject(ctx context.Context, bucket, objectKey string, expiry time.Duration) (string, error)
	PresignGetObject(ctx context.Context, bucket, objectKey string, expiry time.Duration) (string, error)
	StatObject(ctx context.Context, bucket, objectKey string) (*ObjectInfo, error)
}

type MinioStorage struct {
	client *minio.Client
}

type ObjectInfo struct {
	Size        int64
	ContentType string
}

func ResolvePublicEndpoint(cfg *conf.OSS) string {
	if cfg == nil {
		return ""
	}
	if publicEndpoint := strings.TrimSpace(cfg.GetPublicEndpoint()); publicEndpoint != "" {
		return publicEndpoint
	}
	endpoint := strings.TrimSpace(cfg.GetEndpoint())
	if endpoint == "" {
		return ""
	}
	scheme := "http"
	if cfg.GetUseSsl() {
		scheme = "https"
	}
	return scheme + "://" + endpoint
}

func NewMinio(cfg *conf.OSS) (*MinioStorage, error) {
	client, err := minio.New(cfg.GetEndpoint(), &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.GetAccessKey(), cfg.GetSecretKey(), ""),
		Secure: cfg.GetUseSsl(),
	})
	if err != nil {
		return nil, err
	}
	return &MinioStorage{client: client}, nil
}

func (s *MinioStorage) EnsureBucket(ctx context.Context, bucket string) error {
	// 不要用 BucketExists（HEAD）：CDN（Cloudflare）后 HEAD 的 SigV4 头部签名可能被改写而间歇 403，
	// 会导致启动期偶发失败。改用 GetBucketLocation（GET）探测，不存在再创建。
	if _, err := s.client.GetBucketLocation(ctx, bucket); err != nil {
		if minio.ToErrorResponse(err).Code == "NoSuchBucket" {
			return s.client.MakeBucket(ctx, bucket, minio.MakeBucketOptions{})
		}
		return err
	}
	return nil
}

func (s *MinioStorage) PutObject(ctx context.Context, bucket, objectKey, contentType string, data []byte) (string, error) {
	_, err := s.client.PutObject(ctx, bucket, objectKey, bytes.NewReader(data), int64(len(data)), minio.PutObjectOptions{
		ContentType: contentType,
	})
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("minio://%s/%s", bucket, objectKey), nil
}

func (s *MinioStorage) GetObject(ctx context.Context, bucket, objectKey string) ([]byte, error) {
	obj, err := s.client.GetObject(ctx, bucket, objectKey, minio.GetObjectOptions{})
	if err != nil {
		return nil, err
	}
	defer obj.Close()
	return io.ReadAll(obj)
}

func (s *MinioStorage) PresignPutObject(ctx context.Context, bucket, objectKey string, expiry time.Duration) (string, error) {
	if expiry <= 0 {
		expiry = 15 * time.Minute
	}
	presigned, err := s.client.PresignedPutObject(ctx, bucket, objectKey, expiry)
	if err != nil {
		return "", err
	}
	return presigned.String(), nil
}

func (s *MinioStorage) PresignGetObject(ctx context.Context, bucket, objectKey string, expiry time.Duration) (string, error) {
	if expiry <= 0 {
		expiry = time.Hour
	}
	presigned, err := s.client.PresignedGetObject(ctx, bucket, objectKey, expiry, nil)
	if err != nil {
		return "", err
	}
	return presigned.String(), nil
}

func (s *MinioStorage) StatObject(ctx context.Context, bucket, objectKey string) (*ObjectInfo, error) {
	// 注意：不要用 client.StatObject（HEAD）。当 MinIO 位于 Cloudflare 等 CDN 之后时，
	// HEAD 上的 SigV4 头部签名会被代理改写导致 403（而 GET / 预签名 URL 正常）。
	// 这里改用 List(GET) 精确前缀匹配来判断对象是否存在，避免 HEAD。
	for obj := range s.client.ListObjects(ctx, bucket, minio.ListObjectsOptions{
		Prefix:    objectKey,
		Recursive: true,
		MaxKeys:   1,
	}) {
		if obj.Err != nil {
			return nil, obj.Err
		}
		if obj.Key == objectKey {
			return &ObjectInfo{
				Size:        obj.Size,
				ContentType: obj.ContentType,
			}, nil
		}
		break
	}
	return nil, fmt.Errorf("object not found: %s/%s", bucket, objectKey)
}

func RewritePresignedHost(rawURL, publicEndpoint string) (string, error) {
	if publicEndpoint = strings.TrimSpace(publicEndpoint); publicEndpoint == "" {
		return rawURL, nil
	}

	target, err := url.Parse(rawURL)
	if err != nil {
		return "", err
	}
	publicURL, err := url.Parse(publicEndpoint)
	if err != nil {
		return "", err
	}
	target.Scheme = publicURL.Scheme
	target.Host = publicURL.Host
	return target.String(), nil
}
