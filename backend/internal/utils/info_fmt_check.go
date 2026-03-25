/* *
 * @Author: chengjiang
 * @Date: 2026-03-04 14:14:17
 * @Description: 校验手机相关.
**/
package utils

import (
	"regexp"
)

func IsValidPhoneEasy(phone string) bool {
	re := regexp.MustCompile(`^1[3-9]\d{9}$`)
	return re.MatchString(phone)
}

// VerifyMobileFormat 验证手机号格式是否正确
// ^1：手机号以1开头。
// (?:3[0-9]|4[5-9]|5[0-35-9]|6[2-7]|7[0-8]|8[0-9]|9[0-9])：匹配第二位数字，覆盖所有已知号段：
// 3[0-9]：130-139
// 4[5-9]：145-149（包括145、147等）
// 5[0-35-9]：150-153、155-159
// 6[2-7]：162-167（包括166、167等）
// 7[0-8]：170-178（包括171、175-178）
// 8[0-9]：180-189
// 9[0-9]：190-199（包括198、199）
// \d{8}：后跟8位数字（总长度为11位）。
func IsValidPhoneStrict(mobileNum string) bool {
	regular := "^((13[0-9])|(14[5-9])|(15[0-3,5-9])|(16[2-7])|(17[0-8])|(18[0-9])|(19[0-9]))\\d{8}$"

	reg := regexp.MustCompile(regular)
	return reg.MatchString(mobileNum)
}

// IsValidEmail 验证邮箱格式是否正确
func IsValidEmail(email string) bool {
	pattern := `\w+([-+.]\w+)*@\w+([-.]\w+)*\.\w+([-.]\w+)*`
	reg := regexp.MustCompile(pattern)
	return reg.MatchString(email)
}