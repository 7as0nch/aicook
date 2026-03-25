/* *
 * @Author: chengjiang
 * @Date: 2026-03-19 17:18:30
 * @Description: waitgo — 注册多个并发协程，主协程 Wait 全部结束
**/
package utils

import (
	"log"
	"sync"
)

// WaitGo 封装 sync.WaitGroup，用于批量启动 goroutine 并在主协程统一等待。
// 零值可用；也可通过 NewWaitGo 获取指针。
type WaitGo struct {
	wg sync.WaitGroup
}

// NewWaitGo 创建 WaitGo 实例（与 &WaitGo{} 等价）。
func NewWaitGo() *WaitGo {
	return &WaitGo{}
}

// Go 启动一个 goroutine 执行 f；f 为 nil 时忽略。
// 单个 f 内 panic 会被 recover 并打日志，不影响其他任务与 Wait 返回。
func (w *WaitGo) Go(f func()) {
	if w == nil || f == nil {
		return
	}
	w.wg.Add(1)
	go func() {
		defer w.wg.Done()
		defer func() {
			if r := recover(); r != nil {
				log.Printf("WaitGo: recovered panic: %v", r)
			}
		}()
		f()
	}()
}

// Wait 阻塞直到此前通过 Go 提交的所有任务执行完毕（含其 defer）。
func (w *WaitGo) Wait() {
	if w == nil {
		return
	}
	w.wg.Wait()
}

// safego，防止panic
func Safego(f func()) {
	go func() {
		defer func() {
			if r := recover(); r != nil {
				log.Printf("[safego] panic: %v", r)
			}
		}()
		f()
	}()
}