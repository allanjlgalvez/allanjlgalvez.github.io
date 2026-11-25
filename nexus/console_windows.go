//go:build windows

package main

import (
	"syscall"
	"unsafe"
)

// En Windows la consola usa otra codificación por defecto; la cambiamos a
// UTF-8 para que se vean bien los acentos y el logotipo, y ponemos un título.
func init() {
	k := syscall.NewLazyDLL("kernel32.dll")
	k.NewProc("SetConsoleOutputCP").Call(65001)
	k.NewProc("SetConsoleCP").Call(65001)
	if t, err := syscall.UTF16PtrFromString("NEXUS — servidor local"); err == nil {
		k.NewProc("SetConsoleTitleW").Call(uintptr(unsafe.Pointer(t)))
	}
}
