/* *
 * @Author: chengjiang
 * @Date: 2026-03-17 14:00:24
 * @Description:
**/
package pay

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	alipay "github.com/smartwalle/alipay/v3"
)

type alipayClient struct {
	client *alipay.Client
	cfg    AlipayConfig
}

// alipayJSONResponseTransport 支付宝 openapi 正常返回 JSON 对象；若出现 HTML/XML（常以 '<' 开头），
// 多为代理/WAF、网关 5xx 页，或 is_production 与密钥环境不一致导致请求落到错误环境。
type alipayJSONResponseTransport struct {
	inner http.RoundTripper
}

func (t alipayJSONResponseTransport) RoundTrip(r *http.Request) (*http.Response, error) {
	if t.inner == nil {
		t.inner = http.DefaultTransport
	}
	resp, err := t.inner.RoundTrip(r)
	if err != nil || resp == nil {
		return resp, err
	}
	body, readErr := io.ReadAll(resp.Body)
	_ = resp.Body.Close()
	if readErr != nil {
		return nil, readErr
	}
	trimmed := bytes.TrimSpace(body)
	trimmed = bytes.TrimPrefix(trimmed, []byte{0xEF, 0xBB, 0xBF}) // UTF-8 BOM
	if len(trimmed) == 0 {
		return nil, fmt.Errorf(
			"支付宝网关返回空响应（HTTP %d Content-Type=%q），可能出现网络中断、限流或中间设备丢弃了响应体",
			resp.StatusCode, resp.Header.Get("Content-Type"),
		)
	}
	c := trimmed[0]
	if c != '{' && c != '[' {
		snip := string(trimmed)
		if len(snip) > 400 {
			snip = snip[:400] + "..."
		}
		ct := resp.Header.Get("Content-Type")
		hint := "请核对 is_production 与密钥是否同为正式/沙箱、网络代理是否拦截。"
		if strings.Contains(r.URL.Host, "sandbox") {
			hint += " 当前请求沙箱网关：消费者投诉 batchquery 在沙箱常返回 HTML 而非 JSON，正式收款请把 params 里 is_production 设为 true。"
		}
		return nil, fmt.Errorf(
			"支付宝网关返回非 JSON（HTTP %d Content-Type=%q）。%s 响应片段: %s",
			resp.StatusCode, ct, hint, snip,
		)
	}
	resp.Body = io.NopCloser(bytes.NewReader(body))
	return resp, nil
}

func newAlipaySDKClient(cfg AlipayConfig) (*alipay.Client, error) {
	if cfg.AppID == "" || cfg.PrivateKey == "" || cfg.AliPayPublicKey == "" {
		return nil, errors.New("alipay config is incomplete")
	}
	httpClient := &http.Client{
		Transport: alipayJSONResponseTransport{inner: http.DefaultTransport},
	}
	client, err := alipay.New(cfg.AppID, cfg.PrivateKey, cfg.IsProduction, alipay.WithHTTPClient(httpClient))
	if err != nil {
		return nil, err
	}
	if err := client.LoadAliPayPublicKey(cfg.AliPayPublicKey); err != nil {
		return nil, err
	}
	if cfg.EncryptKey != "" {
		if err := client.SetEncryptKey(cfg.EncryptKey); err != nil {
			return nil, err
		}
	}
	return client, nil
}

func NewAlipayClient(cfg AlipayConfig) (Client, error) {
	client, err := newAlipaySDKClient(cfg)
	if err != nil {
		return nil, err
	}
	return &alipayClient{
		client: client,
		cfg:    cfg,
	}, nil
}

// SecurityRiskComplaintInfoBatchQuery 消费者投诉列表查询（alipay.security.risk.complaint.info.batchquery）
func SecurityRiskComplaintInfoBatchQuery(ctx context.Context, cfg AlipayConfig, param alipay.SecurityRiskComplaintInfoBatchQueryReq) (*alipay.SecurityRiskComplaintInfoBatchQueryRsp, error) {
	client, err := newAlipaySDKClient(cfg)
	if err != nil {
		return nil, err
	}
	return client.SecurityRiskComplaintInfoBatchQuery(ctx, param)
}

func (c *alipayClient) AppPay(order AppPayOrder) (string, error) {
	param := alipay.TradeAppPay{}
	param.NotifyURL = c.cfg.NotifyURL
	param.Subject = order.Subject
	param.OutTradeNo = order.OutTradeNo
	param.TotalAmount = order.TotalAmount
	param.Body = order.Body
	param.ProductCode = "QUICK_MSECURITY_PAY"
	param.TimeoutExpress = "30m"
	return c.client.TradeAppPay(param)
}

func (c *alipayClient) WapPay(order AppPayOrder) (string, error) {
	param := alipay.TradeWapPay{}
	param.NotifyURL = c.cfg.NotifyURL
	param.ReturnURL = c.cfg.ReturnURL
	param.QuitURL = c.cfg.QuitURL
	param.Subject = order.Subject
	param.OutTradeNo = order.OutTradeNo
	param.TotalAmount = order.TotalAmount
	param.Body = order.Body
	param.ProductCode = "QUICK_WAP_WAY"
	param.TimeoutExpress = "30m"
	url, err := c.client.TradeWapPay(param)
	if err != nil {
		return "", err
	}
	return url.String(), nil
}

func (c *alipayClient) PagePay(order AppPayOrder) (string, error) {
	param := alipay.TradePagePay{}
	param.NotifyURL = c.cfg.NotifyURL
	param.ReturnURL = c.cfg.ReturnURL
	param.Subject = order.Subject
	param.OutTradeNo = order.OutTradeNo
	param.TotalAmount = order.TotalAmount
	param.Body = order.Body
	param.ProductCode = "FAST_INSTANT_TRADE_PAY"
	param.IntegrationType = "PCWEB"
	url, err := c.client.TradePagePay(param)
	if err != nil {
		return "", err
	}
	if url == nil {
		return "", errors.New("alipay page pay url is empty")
	}
	return url.String(), nil
}

func (c *alipayClient) Refund(order RefundOrder) (map[string]string, error) {
	resp, err := c.client.TradeRefund(context.Background(), alipay.TradeRefund{
		OutTradeNo:   order.OutTradeNo,
		TradeNo:      order.TradeNo,
		RefundAmount: order.RefundAmount,
		RefundReason: order.RefundReason,
		OutRequestNo: order.OutRequestNo,
	})
	if err != nil {
		return nil, err
	}
	if resp.IsFailure() {
		if resp.SubMsg != "" {
			return nil, errors.New(resp.SubMsg)
		}
		return nil, errors.New(resp.Msg)
	}
	result := map[string]string{
		"code":        string(resp.Code),
		"msg":         resp.Msg,
		"sub_code":    resp.SubCode,
		"sub_msg":     resp.SubMsg,
		"trade_no":    resp.TradeNo,
		"out_trade_no": resp.OutTradeNo,
		"refund_fee":  resp.RefundFee,
		"fund_change": resp.FundChange,
	}
	return result, nil
}

func (c *alipayClient) Query(outTradeNo string) (map[string]string, error) {
	resp, err := c.client.TradeQuery(context.Background(), alipay.TradeQuery{
		OutTradeNo: outTradeNo,
	})
	if err != nil {
		return nil, err
	}
	if resp.IsFailure() {
		if resp.SubMsg != "" {
			return nil, errors.New(resp.SubMsg)
		}
		return nil, errors.New(resp.Msg)
	}
	result := map[string]string{
		"code":            string(resp.Code),
		"msg":             resp.Msg,
		"sub_code":        resp.SubCode,
		"sub_msg":         resp.SubMsg,
		"trade_status":    string(resp.TradeStatus),
		"trade_no":        resp.TradeNo,
		"out_trade_no":    resp.OutTradeNo,
		"total_amount":    resp.TotalAmount,
		"receipt_amount":  resp.ReceiptAmount,
		"send_pay_date":   resp.SendPayDate,
	}
	return result, nil
}

func (c *alipayClient) ParseTradeNotification(req *http.Request) (*TradeNotification, error) {
	if req == nil {
		return nil, errors.New("request 参数不能为空")
	}
	if err := req.ParseForm(); err != nil {
		return nil, err
	}
	noti, err := c.client.DecodeNotification(context.Background(), req.Form)
	if err != nil {
		return nil, err
	}
	return &TradeNotification{
		OutTradeNo:     noti.OutTradeNo,
		TradeNo:        noti.TradeNo,
		TradeStatus:    string(noti.TradeStatus),
		TotalAmount:    noti.TotalAmount,
		ReceiptAmount:  noti.ReceiptAmount,
		BuyerPayAmount: noti.BuyerPayAmount,
		GmtPayment:     noti.GmtPayment,
	}, nil
}

func (c *alipayClient) AckNotification(w http.ResponseWriter) {
	c.client.ACKNotification(w)
}
