//go:build captcha
// +build captcha

package utils

import (
	"errors"
	"sync"

	captcha "github.com/wenlng/go-captcha/v2"
	"github.com/wenlng/go-captcha/v2/slide"
	assetImages "github.com/wenlng/go-captcha-assets/resources/imagesv2"
	assetTiles "github.com/wenlng/go-captcha-assets/resources/tiles"
)

type SlideCaptchaData struct {
	DX          int
	DY          int
	MasterImage string
	TileImage   string
}

var (
	slideCaptchaOnce sync.Once
	slideCaptchaInst slide.Captcha
	slideCaptchaErr  error
)

func GenerateSlideCaptcha() (*SlideCaptchaData, error) {
	capt, err := getSlideCaptcha()
	if err != nil {
		return nil, err
	}
	captData, err := capt.Generate()
	if err != nil {
		return nil, err
	}
	block := captData.GetData()
	if block == nil {
		return nil, errors.New("captcha block is nil")
	}
	masterImage, err := captData.GetMasterImage().ToBase64()
	if err != nil {
		return nil, err
	}
	tileImage, err := captData.GetTileImage().ToBase64()
	if err != nil {
		return nil, err
	}
	return &SlideCaptchaData{
		// For backend verification we need the target hole position (block.X/Y),
		// not the slider's initial display position (block.DX/DY).
		DX:          block.X,
		DY:          block.Y,
		MasterImage: masterImage,
		TileImage:   tileImage,
	}, nil
}

func ValidateSlideCaptcha(pointX, pointY, dx, dy, padding int) bool {
	return slide.Validate(pointX, pointY, dx, dy, padding)
}

func getSlideCaptcha() (slide.Captcha, error) {
	slideCaptchaOnce.Do(func() {
		bgImages, err := assetImages.GetImages()
		if err != nil {
			slideCaptchaErr = err
			return
		}
		graphAssets, err := assetTiles.GetTiles()
		if err != nil {
			slideCaptchaErr = err
			return
		}

		graphs := make([]*slide.GraphImage, 0, len(graphAssets))
		for _, v := range graphAssets {
			graphs = append(graphs, &slide.GraphImage{
				OverlayImage: v.OverlayImage,
				ShadowImage:  v.ShadowImage,
				MaskImage:    v.MaskImage,
			})
		}

		builder := captcha.NewSlideBuilder()
		builder.SetResources(
			slide.WithGraphImages(graphs),
			slide.WithBackgrounds(bgImages),
		)
		// Use slider mode so tile Y stays aligned and only X drag is needed.
		slideCaptchaInst = builder.Make()
	})

	if slideCaptchaErr != nil {
		return nil, slideCaptchaErr
	}
	if slideCaptchaInst == nil {
		return nil, errors.New("init slide captcha failed")
	}
	return slideCaptchaInst, nil
}
