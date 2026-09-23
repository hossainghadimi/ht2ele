//go:build windows

package main

import (
	"syscall"
	"unsafe"
)

func initConsole() {
	k32 := syscall.NewLazyDLL("kernel32.dll")
	k32.NewProc("SetConsoleOutputCP").Call(65001)
	k32.NewProc("SetConsoleCP").Call(65001)
	title, err := syscall.UTF16PtrFromString("HTML2Elementor")
	if err == nil {
		k32.NewProc("SetConsoleTitleW").Call(uintptr(unsafe.Pointer(title)))
	}
}
