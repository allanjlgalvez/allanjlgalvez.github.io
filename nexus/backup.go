package main

// Respaldos cifrados (.nexus)
//
// Formato: "NEXUSBK1" | sal (16) | prefijo de nonce (8) | bloques...
// Cada bloque: longitud uint32 BE | AES-256-GCM(datos), nonce = prefijo|contador,
// dato adicional = 1 en el último bloque (detecta archivos truncados).
// La llave se deriva de la contraseña del respaldo con scrypt.
// El contenido descifrado es un ZIP con nexus.db, config.json y archivos/.

import (
	"archive/zip"
	"bufio"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"golang.org/x/crypto/scrypt"
	"golang.org/x/term"
)

const (
	bkMagic   = "NEXUSBK1"
	bkChunk   = 1 << 20
	bkMaxSeal = bkChunk + 16
)

func deriveKey(pw string, salt []byte) ([]byte, error) {
	return scrypt.Key([]byte(pw), salt, 1<<15, 8, 1, 32)
}

type encWriter struct {
	w      io.Writer
	aead   cipher.AEAD
	prefix []byte
	ctr    uint32
	buf    []byte
}

func newEncWriter(w io.Writer, pw string) (*encWriter, error) {
	salt := make([]byte, 16)
	prefix := make([]byte, 8)
	if _, err := rand.Read(salt); err != nil {
		return nil, err
	}
	if _, err := rand.Read(prefix); err != nil {
		return nil, err
	}
	key, err := deriveKey(pw, salt)
	if err != nil {
		return nil, err
	}
	blk, _ := aes.NewCipher(key)
	aead, _ := cipher.NewGCM(blk)
	if _, err := w.Write(append(append([]byte(bkMagic), salt...), prefix...)); err != nil {
		return nil, err
	}
	return &encWriter{w: w, aead: aead, prefix: prefix, buf: make([]byte, 0, bkChunk)}, nil
}

func (e *encWriter) nonce() []byte {
	n := make([]byte, 12)
	copy(n, e.prefix)
	binary.BigEndian.PutUint32(n[8:], e.ctr)
	e.ctr++
	return n
}

func (e *encWriter) flush(final bool) error {
	ad := []byte{0}
	if final {
		ad[0] = 1
	}
	sealed := e.aead.Seal(nil, e.nonce(), e.buf, ad)
	var l [4]byte
	binary.BigEndian.PutUint32(l[:], uint32(len(sealed)))
	if _, err := e.w.Write(l[:]); err != nil {
		return err
	}
	_, err := e.w.Write(sealed)
	e.buf = e.buf[:0]
	return err
}

func (e *encWriter) Write(p []byte) (int, error) {
	n := 0
	for len(p) > 0 {
		k := min(bkChunk-len(e.buf), len(p))
		e.buf = append(e.buf, p[:k]...)
		p = p[k:]
		n += k
		if len(e.buf) == bkChunk {
			if err := e.flush(false); err != nil {
				return n, err
			}
		}
	}
	return n, nil
}

func (e *encWriter) Close() error { return e.flush(true) }

func decryptBackup(r io.Reader, w io.Writer, pw string) error {
	hdr := make([]byte, len(bkMagic)+24)
	if _, err := io.ReadFull(r, hdr); err != nil || string(hdr[:len(bkMagic)]) != bkMagic {
		return errors.New("no es un respaldo de NEXUS")
	}
	key, err := deriveKey(pw, hdr[8:24])
	if err != nil {
		return err
	}
	blk, _ := aes.NewCipher(key)
	aead, _ := cipher.NewGCM(blk)
	d := &encWriter{prefix: hdr[24:32]}
	for {
		var l [4]byte
		if _, err := io.ReadFull(r, l[:]); err != nil {
			return errors.New("el respaldo está incompleto o dañado")
		}
		n := binary.BigEndian.Uint32(l[:])
		if n > bkMaxSeal {
			return errors.New("el respaldo está dañado")
		}
		sealed := make([]byte, n)
		if _, err := io.ReadFull(r, sealed); err != nil {
			return errors.New("el respaldo está incompleto o dañado")
		}
		nonce := d.nonce()
		if plain, err := aead.Open(nil, nonce, sealed, []byte{0}); err == nil {
			if _, err := w.Write(plain); err != nil {
				return err
			}
			continue
		}
		plain, err := aead.Open(nil, nonce, sealed, []byte{1})
		if err != nil {
			if d.ctr == 1 {
				return errors.New("contraseña incorrecta")
			}
			return errors.New("el respaldo está dañado")
		}
		_, err = w.Write(plain)
		return err
	}
}

func hBackup(w http.ResponseWriter, r *http.Request) {
	var in struct{ Password string }
	if !readJSON(w, r, &in) {
		return
	}
	if len([]rune(in.Password)) < 6 {
		jsonErr(w, http.StatusBadRequest, "la contraseña del respaldo debe tener al menos 6 caracteres")
		return
	}
	snap := filepath.Join(dataDir, "respaldos", ".snapshot.db")
	_ = os.Remove(snap)
	if _, err := db.Exec("VACUUM INTO ?", snap); err != nil {
		serverErr(w, err)
		return
	}
	defer os.Remove(snap)

	fname := "nexus-respaldo-" + time.Now().Format("2006-01-02-1504") + ".nexus"
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", `attachment; filename="`+fname+`"`)
	bw := bufio.NewWriterSize(w, 256<<10)
	enc, err := newEncWriter(bw, in.Password)
	if err != nil {
		serverErr(w, err)
		return
	}
	zw := zip.NewWriter(enc)
	add := func(src, name string, method uint16) error {
		f, err := os.Open(src)
		if err != nil {
			return err
		}
		defer f.Close()
		st, _ := f.Stat()
		hh, _ := zip.FileInfoHeader(st)
		hh.Name, hh.Method = name, method
		dst, err := zw.CreateHeader(hh)
		if err != nil {
			return err
		}
		_, err = io.Copy(dst, f)
		return err
	}
	err = add(snap, "nexus.db", zip.Deflate)
	if err == nil {
		_ = add(filepath.Join(dataDir, "config.json"), "config.json", zip.Deflate)
		err = filepath.WalkDir(filesDir, func(p string, d fs.DirEntry, err error) error {
			if err != nil || d.IsDir() {
				return err
			}
			rel, _ := filepath.Rel(filesDir, p)
			return add(p, "archivos/"+filepath.ToSlash(rel), zip.Store)
		})
	}
	if err == nil {
		err = zw.Close()
	}
	if err == nil {
		err = enc.Close()
	}
	if err == nil {
		err = bw.Flush()
	}
	if err != nil {
		fmt.Println("  error en respaldo:", err)
	}
}

// runRestore se ejecuta desde la consola: nexus.exe -restaurar archivo.nexus
func runRestore(path string) {
	fmt.Println(banner)
	fmt.Printf("\n  Restaurar respaldo: %s\n  Destino:            %s\n\n", path, dataDir)
	in, err := os.Open(path)
	if err != nil {
		fatal("No se pudo abrir el respaldo: %v", err)
	}
	defer in.Close()

	fmt.Print("  Contraseña del respaldo: ")
	var pwb []byte
	if term.IsTerminal(int(os.Stdin.Fd())) {
		pwb, err = term.ReadPassword(int(os.Stdin.Fd()))
	} else {
		var line string
		line, err = bufio.NewReader(os.Stdin).ReadString('\n')
		pwb = []byte(strings.TrimRight(line, "\r\n"))
		if err == io.EOF && line != "" {
			err = nil
		}
	}
	fmt.Println()
	if err != nil {
		fatal("No se pudo leer la contraseña: %v", err)
	}

	parent := filepath.Dir(dataDir)
	tmpZip, err := os.CreateTemp(parent, ".nexus-restaurar-*.zip")
	if err != nil {
		fatal("%v", err)
	}
	defer os.Remove(tmpZip.Name())
	fmt.Println("  Descifrando...")
	if err := decryptBackup(bufio.NewReaderSize(in, 1<<20), tmpZip, string(pwb)); err != nil {
		tmpZip.Close()
		fatal("%v", err)
	}
	tmpZip.Close()

	stage := dataDir + ".restaurando"
	_ = os.RemoveAll(stage)
	if err := unzipTo(tmpZip.Name(), stage); err != nil {
		os.RemoveAll(stage)
		fatal("No se pudo extraer el respaldo: %v", err)
	}
	if _, err := os.Stat(dataDir); err == nil {
		old := dataDir + "-anterior-" + time.Now().Format("20060102-150405")
		if err := os.Rename(dataDir, old); err != nil {
			os.RemoveAll(stage)
			fatal("No se pudo apartar la carpeta actual (¿NEXUS sigue abierto?): %v", err)
		}
		fmt.Printf("  Tus datos actuales se guardaron en: %s\n", old)
	}
	if err := os.Rename(stage, dataDir); err != nil {
		fatal("%v", err)
	}
	os.MkdirAll(filepath.Join(dataDir, "archivos"), 0o700)
	fmt.Println("\n  ✔ Respaldo restaurado. Ya puedes abrir NEXUS normalmente.")
	pause()
}

func unzipTo(zipPath, dest string) error {
	zr, err := zip.OpenReader(zipPath)
	if err != nil {
		return err
	}
	defer zr.Close()
	for _, f := range zr.File {
		clean := filepath.Clean(filepath.FromSlash(f.Name))
		if filepath.IsAbs(clean) || clean == ".." || strings.HasPrefix(clean, ".."+string(filepath.Separator)) {
			return fmt.Errorf("ruta no permitida: %s", f.Name)
		}
		target := filepath.Join(dest, clean)
		if f.FileInfo().IsDir() {
			os.MkdirAll(target, 0o700)
			continue
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o700); err != nil {
			return err
		}
		src, err := f.Open()
		if err != nil {
			return err
		}
		out, err := os.OpenFile(target, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
		if err != nil {
			src.Close()
			return err
		}
		_, err = io.Copy(out, src)
		src.Close()
		out.Close()
		if err != nil {
			return err
		}
	}
	return nil
}
