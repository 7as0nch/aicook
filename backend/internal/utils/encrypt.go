/* *
 * @Author: chengjiang
 * @Date: 2026-03-05 16:34:07
 * @Description:
**/
package utils

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"database/sql/driver"
	"encoding/base64"
	"fmt"
	"strings"

	"github.com/google/uuid"
)

// AesKey 默认的AesKey
var AesKey = []byte{35, 46, 57, 24, 85, 35, 24, 74, 87, 35, 88, 98, 66, 32, 14, 05}

type Aes struct {
	rawData    string //原始值
	aesKey     string //加密字符串
	hashedData string //加密后的值
}

// GetRawData 返回加密前的原始值
func (a *Aes) GetRawData() string {
	return a.rawData
}

// 解密
func (a *Aes) Scan(value interface{}) error {
	var data string
	if a.aesKey == "" {
		a.aesKey = string(AesKey)
	}
	if d, ok := value.([]byte); ok {
		data = string(d)
	} else if d, ok := value.(string); ok {
		data = d
	}
	crytedByte, _ := base64.RawURLEncoding.DecodeString(string(data))

	// 分组秘钥
	block, err := aes.NewCipher([]byte(a.aesKey))
	if err != nil {
		return fmt.Errorf("key 长度必须 16/24/32长度: %s", err.Error())
	}
	// 获取秘钥块的长度
	blockSize := block.BlockSize()
	// 加密模式
	blockMode := cipher.NewCBCDecrypter(block, []byte(a.aesKey[:blockSize]))
	// 创建数组
	orig := make([]byte, len(crytedByte))
	// 解密
	blockMode.CryptBlocks(orig, crytedByte)
	// 去补全码
	orig = pKCS7UnPadding(orig)
	a.rawData = string(orig)
	a.hashedData = string(data)
	return nil
}

// 加密 实现sql的Value接口
func (a Aes) Value() (driver.Value, error) {
	//使用RawURLEncoding 不要使用StdEncoding
	return a.hashedData, nil
}

// GetRawData 返回加密后的值
func (a Aes) GetEncrypted() string {
	return a.hashedData
}

func (a Aes) encrypted() string {
	if a.aesKey == "" {
		a.aesKey = string(AesKey)
	}
	origData := []byte(a.rawData)
	// 分组秘钥
	block, err := aes.NewCipher([]byte(a.aesKey))
	if err != nil {
		return ""
	}
	// 获取秘钥块的长度
	blockSize := block.BlockSize()
	// 补全码
	origData = pKCS7Padding(origData, blockSize)
	// 加密模式
	blockMode := cipher.NewCBCEncrypter(block, []byte(a.aesKey[:blockSize]))
	// 创建数组
	cryted := make([]byte, len(origData))
	// 加密
	blockMode.CryptBlocks(cryted, origData)
	//使用RawURLEncoding 不要使用StdEncoding
	return base64.RawURLEncoding.EncodeToString(cryted)
}

func pKCS7Padding(ciphertext []byte, blockSize int) []byte {
	padding := blockSize - len(ciphertext)%blockSize
	padtext := bytes.Repeat([]byte{byte(padding)}, padding)
	return append(ciphertext, padtext...)
}

func pKCS7UnPadding(origData []byte) []byte {
	length := len(origData)
	if len(origData) == 0 {
		return nil
	}
	unpadding := int(origData[length-1])
	return origData[:(length - unpadding)]
}

// NewAes 切记data为原始字符串，非加密的字符串,解密字符串请使用func AesDecrypt
func NewAes(data string, options ...AesOption) Aes {
	ase := Aes{}
	ase.rawData = data
	for _, option := range options {
		option(&ase)
	}
	ase.hashedData = ase.encrypted()
	return ase
}

// AesDecrypt 根据aesKey解密字符串
func AesDecrypt(decrypted string, options ...AesOption) string {
	aes := Aes{}
	for _, option := range options {
		option(&aes)
	}
	aes.Scan(decrypted)
	return aes.GetRawData()
}

type AesOption func(*Aes)

func AesKeyOption(aesKey string) AesOption {
	return func(aes *Aes) {
		aes.aesKey = aesKey
	}
}


// GetUUID 获取uuid
func GetUUID() string {
	return strings.ReplaceAll(uuid.New().String(), "-", "")
}