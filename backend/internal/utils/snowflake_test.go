/* *
 * @Author: chengjiang
 * @Date: 2026-03-02 17:47:02
 * @Description:
**/
package utils

import (
	"testing"
)

func TestGetSFID(t *testing.T) {
	sfid := GetSFID()
	t.Logf("sfid: %d", sfid)
}

func TestBase62AndSFID(t *testing.T) {
	sfid := GetSFID()
	b := ToBase62(sfid)
	t.Logf("base62: %s, sfid: %d", b, sfid)
	sfid = Base62ToSFID(b)
	t.Logf("sfid: %d, base62: %s", sfid, b)
}