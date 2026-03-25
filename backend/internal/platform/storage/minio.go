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
	StatObject(ctx context.Context, bucket, objectKey string) (*ObjectInfo, error)
}

type MinioStorage struct {
	client *minio.Client
}

type ObjectInfo struct {
	Size        int64
	ContentType string
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
	exists, err := s.client.BucketExists(ctx, bucket)
	if err != nil {
		return err
	}
	if exists {
		return nil
	}
	return s.client.MakeBucket(ctx, bucket, minio.MakeBucketOptions{})
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

func (s *MinioStorage) StatObject(ctx context.Context, bucket, objectKey string) (*ObjectInfo, error) {
	info, err := s.client.StatObject(ctx, bucket, objectKey, minio.StatObjectOptions{})
	if err != nil {
		return nil, err
	}
	return &ObjectInfo{
		Size:        info.Size,
		ContentType: info.ContentType,
	}, nil
}

func RewritePresignedHost(rawURL, publicEndpoint string) (string, error) {
	if strings.TrimSpace(publicEndpoint) == "" {
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
