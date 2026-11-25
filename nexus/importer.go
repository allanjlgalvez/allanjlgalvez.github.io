package main

import (
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// Hosts desde los que se permite descargar fotos de contactos importados
// (Google Contactos entrega las fotos como enlaces a estos dominios).
var photoHosts = []string{"googleusercontent.com", "ggpht.com"}

var photoClient = &http.Client{Timeout: 20 * time.Second}

// hPhotoURL descarga la foto de un contacto importado y la pone como foto de perfil.
func hPhotoURL(w http.ResponseWriter, r *http.Request) {
	eid := pathID(r)
	var in struct {
		URL string `json:"url"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	u, err := url.Parse(strings.TrimSpace(in.URL))
	if err != nil || u.Scheme != "https" {
		jsonErr(w, http.StatusBadRequest, "enlace de foto inválido")
		return
	}
	host := strings.ToLower(u.Hostname())
	allowed := false
	for _, h := range photoHosts {
		if host == h || strings.HasSuffix(host, "."+h) {
			allowed = true
		}
	}
	if !allowed {
		jsonErr(w, http.StatusBadRequest, "solo se descargan fotos de Google Contactos")
		return
	}
	var exists int
	if err := db.QueryRow("SELECT COUNT(*) FROM entities WHERE id=?", eid).Scan(&exists); err != nil || exists == 0 {
		jsonErr(w, http.StatusNotFound, "registro no encontrado")
		return
	}

	resp, err := photoClient.Get(u.String())
	if err != nil {
		jsonErr(w, http.StatusBadGateway, "no se pudo descargar la foto (¿hay internet?)")
		return
	}
	defer resp.Body.Close()
	mt, _, _ := mime.ParseMediaType(resp.Header.Get("Content-Type"))
	if resp.StatusCode != http.StatusOK || !strings.HasPrefix(mt, "image/") {
		jsonErr(w, http.StatusBadGateway, "la foto no está disponible")
		return
	}
	ext := ".jpg"
	if exts, _ := mime.ExtensionsByType(mt); len(exts) > 0 {
		ext = exts[0]
		if mt == "image/jpeg" {
			ext = ".jpg"
		}
	}

	rel := strconv.FormatInt(eid, 10)
	dir := filepath.Join(filesDir, rel)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		serverErr(w, err)
		return
	}
	name := time.Now().Format("20060102-150405") + "-" + randHex(4) + ext
	size, err := saveUpload(io.LimitReader(resp.Body, 15<<20), dir, name)
	if err != nil {
		serverErr(w, err)
		return
	}
	res, err := db.Exec(`INSERT INTO files(entity_id,name,mime,size,path,thumb_path,created) VALUES(?,?,?,?,?,'',?)`,
		eid, "foto-google"+ext, mt, size, rel+"/"+name, now())
	if err != nil {
		serverErr(w, err)
		return
	}
	fid, _ := res.LastInsertId()
	if _, err := db.Exec("UPDATE entities SET photo_id=?, updated=? WHERE id=?", fid, now(), eid); err != nil {
		serverErr(w, err)
		return
	}
	writeJSON(w, map[string]any{"id": fid, "size": size, "msg": fmt.Sprintf("foto guardada (%d bytes)", size)})
}
