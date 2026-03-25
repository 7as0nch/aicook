//go:build !captcha
// +build !captcha

package utils

import "errors"

type SlideCaptchaData struct {
	DX          int
	DY          int
	MasterImage string
	TileImage   string
}

func GenerateSlideCaptcha() (*SlideCaptchaData, error) {
	return nil, errors.New("slide captcha is disabled in current build")
}

func ValidateSlideCaptcha(_, _, _, _, _ int) bool {
	return false
}
