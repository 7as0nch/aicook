/* *
 * @Author: chengjiang
 * @Date: 2026-03-17 13:58:54
 * @Description:
**/
package pay

import (
	"fmt"
	"net/http"
)

type AlipayConfig struct {
	AppID           string `json:"app_id"`
	AliPayPublicKey string `json:"alipay_public_key"`
	PrivateKey      string `json:"private_key"`
	NotifyURL       string `json:"notify_url"`
	ReturnURL       string `json:"return_url,omitempty"`
	QuitURL         string `json:"quit_url,omitempty"`
	EncryptKey      string `json:"encrypt_key,omitempty"`
	IsProduction    bool   `json:"is_production"`
}

type AppPayOrder struct {
	Subject     string
	OutTradeNo  string
	TotalAmount string
	Body        string
}

type RefundOrder struct {
	OutTradeNo   string
	TradeNo      string
	RefundAmount string
	RefundReason string
	OutRequestNo string
}

type TradeNotification struct {
	OutTradeNo     string
	TradeNo        string
	TradeStatus    string
	TotalAmount    string
	ReceiptAmount  string
	BuyerPayAmount string
	GmtPayment     string
}

type Client interface {
	AppPay(order AppPayOrder) (string, error)
	WapPay(order AppPayOrder) (string, error)
	PagePay(order AppPayOrder) (string, error)
	Refund(order RefundOrder) (map[string]string, error)
	Query(outTradeNo string) (map[string]string, error)
	ParseTradeNotification(req *http.Request) (*TradeNotification, error)
	AckNotification(w http.ResponseWriter)
}

func NewClientWithConfig(channel PayChannel, cfg AlipayConfig) (Client, error) {
	switch channel {
	case "", PayChannelAlipay:
		return NewAlipayClient(cfg)
	default:
		return nil, fmt.Errorf("不支持的支付渠道: %s", channel)
	}
}

type PayChannel string

const (
	PayChannelAlipay PayChannel = "alipay"
)
