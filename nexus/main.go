// NEXUS — base de datos personal de contactos, 100% local.
//
// Un solo ejecutable: sirve la interfaz web y guarda todo en la carpeta
// "datos" que está junto al ejecutable (base SQLite + archivos).
package main

import (
	"bufio"
	"database/sql"
	"embed"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

var version = "1.2.0" // el compilador de GitHub la reemplaza con -X main.version

//go:embed web
var webFS embed.FS

type Config struct {
	Puerto         int  `json:"puerto"`
	RedLocal       bool `json:"red_local"`
	AbrirNavegador bool `json:"abrir_navegador"`
}

var (
	baseDir  string // carpeta del ejecutable
	dataDir  string // carpeta de datos
	filesDir string // archivos adjuntos
	db       *sql.DB
	cfg      Config
)

func main() {
	restaurar := flag.String("restaurar", "", "restaura un respaldo .nexus en la carpeta de datos")
	datos := flag.String("datos", "", "carpeta de datos (por defecto: 'datos' junto al ejecutable)")
	flag.Parse()

	exe, err := os.Executable()
	if err != nil {
		fatal("No se pudo ubicar el ejecutable: %v", err)
	}
	if r, err := filepath.EvalSymlinks(exe); err == nil {
		exe = r
	}
	baseDir = filepath.Dir(exe)
	dataDir = filepath.Join(baseDir, "datos")
	if *datos != "" {
		dataDir, _ = filepath.Abs(*datos)
	}
	filesDir = filepath.Join(dataDir, "archivos")

	// Arrastrar un archivo .nexus sobre el ejecutable también lo restaura.
	if *restaurar == "" && flag.NArg() == 1 && strings.HasSuffix(strings.ToLower(flag.Arg(0)), ".nexus") {
		*restaurar = flag.Arg(0)
	}
	if *restaurar != "" {
		runRestore(*restaurar)
		return
	}

	for _, d := range []string{dataDir, filesDir, filepath.Join(dataDir, "respaldos", "auto")} {
		if err := os.MkdirAll(d, 0o700); err != nil {
			fatal("No se pudo crear la carpeta %s: %v", d, err)
		}
	}
	loadConfig()

	if err := openDB(filepath.Join(dataDir, "nexus.db")); err != nil {
		fatal("No se pudo abrir la base de datos: %v", err)
	}
	defer db.Close()
	autoBackup()

	host := "127.0.0.1"
	if cfg.RedLocal {
		host = "0.0.0.0"
	}
	addr := fmt.Sprintf("%s:%d", host, cfg.Puerto)
	local := fmt.Sprintf("http://localhost:%d", cfg.Puerto)

	ln, err := net.Listen("tcp", addr)
	if err != nil {
		// Probablemente NEXUS ya está abierto: solo abrimos el navegador.
		fmt.Printf("El puerto %d está ocupado (¿NEXUS ya está abierto?). Abriendo %s\n", cfg.Puerto, local)
		openBrowser(local)
		time.Sleep(2 * time.Second)
		return
	}

	web, _ := fs.Sub(webFS, "web")
	srv := &http.Server{
		Handler:           routes(web),
		ReadHeaderTimeout: 15 * time.Second,
	}

	fmt.Println(banner)
	fmt.Printf("  Versión %s\n  Datos:   %s\n\n", version, dataDir)
	fmt.Printf("  En esta PC:      %s\n", local)
	if cfg.RedLocal {
		for _, u := range lanURLs() {
			fmt.Printf("  En tu red (cel): %s\n", u)
		}
	} else {
		fmt.Println("  Acceso desde la red local: DESACTIVADO (config.json → red_local)")
	}
	fmt.Println("\n  Deja esta ventana abierta mientras usas NEXUS. Ciérrala para apagarlo.")

	if cfg.AbrirNavegador {
		go func() { time.Sleep(400 * time.Millisecond); openBrowser(local) }()
	}
	if err := srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
		fatal("Error del servidor: %v", err)
	}
}

const banner = `
  ███╗   ██╗███████╗██╗  ██╗██╗   ██╗███████╗
  ████╗  ██║██╔════╝╚██╗██╔╝██║   ██║██╔════╝
  ██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║███████╗
  ██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║╚════██║
  ██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝███████║
  ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝`

func loadConfig() {
	cfg = Config{Puerto: 8787, RedLocal: true, AbrirNavegador: true}
	p := filepath.Join(dataDir, "config.json")
	b, err := os.ReadFile(p)
	if err == nil {
		if err := json.Unmarshal(b, &cfg); err != nil {
			fatal("config.json tiene un error de formato: %v", err)
		}
	}
	if cfg.Puerto <= 0 || cfg.Puerto > 65535 {
		cfg.Puerto = 8787
	}
	out, _ := json.MarshalIndent(cfg, "", "  ")
	_ = os.WriteFile(p, out, 0o600)
}

// lanURLs devuelve las direcciones IPv4 privadas de esta PC.
func lanURLs() []string {
	var urls []string
	ifaces, _ := net.Interfaces()
	for _, ifc := range ifaces {
		if ifc.Flags&net.FlagUp == 0 || ifc.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, _ := ifc.Addrs()
		for _, a := range addrs {
			ipn, ok := a.(*net.IPNet)
			if !ok {
				continue
			}
			ip := ipn.IP.To4()
			if ip == nil || !ip.IsPrivate() {
				continue
			}
			urls = append(urls, fmt.Sprintf("http://%s:%d", ip, cfg.Puerto))
		}
	}
	return urls
}

func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	_ = cmd.Start()
}

// fatal muestra el error y espera Enter, para que la ventana no se cierre
// sola al abrir el programa con doble clic.
func fatal(format string, a ...any) {
	fmt.Fprintf(os.Stderr, "\n  ERROR: "+format+"\n", a...)
	pause()
	os.Exit(1)
}

func pause() {
	fmt.Print("\n  Presiona Enter para cerrar...")
	_, _ = bufio.NewReader(os.Stdin).ReadString('\n')
}
