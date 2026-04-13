package biz

import "testing"

func TestBucketForMediaType(t *testing.T) {
	usecase := &MediaUsecase{
		mediaBucket:     "media-bucket",
		knowledgeBucket: "knowledge-bucket",
	}
	if got := usecase.bucketForMediaType("document"); got != "knowledge-bucket" {
		t.Fatalf("document should use knowledge bucket, got %s", got)
	}
	if got := usecase.bucketForMediaType("image"); got != "media-bucket" {
		t.Fatalf("image should use media bucket, got %s", got)
	}
}
