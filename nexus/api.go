package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	qrcode "github.com/skip2/go-qrcode"
)

func routes(web fs.FS) http.Handler {
	mux := http.NewServeMux()

	// Públicas
	mux.HandleFunc("GET /api/state", hState)
	mux.HandleFunc("POST /api/setup", hSetup)
	mux.HandleFunc("POST /api/login", hLogin)
	mux.HandleFunc("POST /api/logout", hLogout)

	// Privadas
	mux.HandleFunc("GET /api/all", auth(hAll))
	mux.HandleFunc("GET /api/info", auth(hInfo))
	mux.HandleFunc("GET /api/qr", auth(hQR))
	mux.HandleFunc("GET /api/search", auth(hSearch))
	mux.HandleFunc("POST /api/password", auth(hPassword))
	mux.HandleFunc("POST /api/backup", auth(hBackup))

	mux.HandleFunc("POST /api/types", auth(hTypeSave))
	mux.HandleFunc("PUT /api/types/{id}", auth(hTypeSave))
	mux.HandleFunc("DELETE /api/types/{id}", auth(hTypeDelete))

	mux.HandleFunc("GET /api/entities/{id}", auth(hEntityGet))
	mux.HandleFunc("POST /api/entities", auth(hEntitySave))
	mux.HandleFunc("PUT /api/entities/{id}", auth(hEntitySave))
	mux.HandleFunc("DELETE /api/entities/{id}", auth(hEntityDelete))
	mux.HandleFunc("PUT /api/entities/{id}/photo", auth(hEntityPhoto))

	mux.HandleFunc("POST /api/relations", auth(hRelationSave))
	mux.HandleFunc("PUT /api/relations/{id}", auth(hRelationSave))
	mux.HandleFunc("DELETE /api/relations/{id}", auth(hRelationDelete))

	mux.HandleFunc("POST /api/entities/{id}/events", auth(hEventSave))
	mux.HandleFunc("PUT /api/events/{id}", auth(hEventSave))
	mux.HandleFunc("DELETE /api/events/{id}", auth(hEventDelete))

	mux.HandleFunc("POST /api/entities/{id}/files", auth(hFileUpload))
	mux.HandleFunc("DELETE /api/files/{id}", auth(hFileDelete))
	mux.HandleFunc("GET /files/{id}", auth(hFileServe))
	mux.HandleFunc("GET /files/{id}/thumb", auth(hFileServe))

	static := http.FileServer(http.FS(web))
	mux.Handle("GET /", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache")
		static.ServeHTTP(w, r)
	}))

	return secure(mux)
}

// secure añade cabeceras de seguridad y protección CSRF: toda petición que
// modifica datos debe traer la cabecera X-Nexus (un formulario ajeno no puede).
func secure(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "no-referrer")
		if r.Method != http.MethodGet && r.Method != http.MethodHead && r.Header.Get("X-Nexus") != "1" {
			http.Error(w, "solicitud rechazada", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func auth(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !validSession(r) {
			jsonErr(w, http.StatusUnauthorized, "sesión no válida")
			return
		}
		h(w, r)
	}
}

// ---------- utilidades ----------

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(v)
}

func jsonErr(w http.ResponseWriter, code int, msg string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func serverErr(w http.ResponseWriter, err error) {
	fmt.Println("  error:", err)
	jsonErr(w, http.StatusInternalServerError, "error interno: "+err.Error())
}

func readJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 4<<20)
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		jsonErr(w, http.StatusBadRequest, "JSON inválido: "+err.Error())
		return false
	}
	return true
}

func pathID(r *http.Request) int64 {
	id, _ := strconv.ParseInt(r.PathValue("id"), 10, 64)
	return id
}

func validJSON(s string, fallback string) string {
	if s == "" || !json.Valid([]byte(s)) {
		return fallback
	}
	return s
}

// ---------- sesión ----------

func hState(w http.ResponseWriter, r *http.Request) {
	h, err := passwordHash()
	if err != nil {
		serverErr(w, err)
		return
	}
	writeJSON(w, map[string]any{"setup": h == "", "logged": h != "" && validSession(r), "version": version})
}

func hSetup(w http.ResponseWriter, r *http.Request) {
	var in struct{ Password string }
	if !readJSON(w, r, &in) {
		return
	}
	if h, _ := passwordHash(); h != "" {
		jsonErr(w, http.StatusConflict, "la contraseña ya fue configurada")
		return
	}
	if len([]rune(in.Password)) < 6 {
		jsonErr(w, http.StatusBadRequest, "la contraseña debe tener al menos 6 caracteres")
		return
	}
	if err := setPassword(in.Password); err != nil {
		serverErr(w, err)
		return
	}
	if err := newSession(w); err != nil {
		serverErr(w, err)
		return
	}
	writeJSON(w, map[string]bool{"ok": true})
}

func hLogin(w http.ResponseWriter, r *http.Request) {
	ip := clientIP(r)
	if d := loginBlocked(ip); d > 0 {
		jsonErr(w, http.StatusTooManyRequests, fmt.Sprintf("demasiados intentos, espera %d s", int(d.Seconds())+1))
		return
	}
	var in struct{ Password string }
	if !readJSON(w, r, &in) {
		return
	}
	if !checkPassword(in.Password) {
		loginFailed(ip)
		time.Sleep(400 * time.Millisecond)
		jsonErr(w, http.StatusUnauthorized, "contraseña incorrecta")
		return
	}
	loginOK(ip)
	if err := newSession(w); err != nil {
		serverErr(w, err)
		return
	}
	writeJSON(w, map[string]bool{"ok": true})
}

func hLogout(w http.ResponseWriter, r *http.Request) {
	endSession(w, r)
	writeJSON(w, map[string]bool{"ok": true})
}

func hPassword(w http.ResponseWriter, r *http.Request) {
	var in struct{ Actual, Nueva string }
	if !readJSON(w, r, &in) {
		return
	}
	if !checkPassword(in.Actual) {
		jsonErr(w, http.StatusUnauthorized, "la contraseña actual no coincide")
		return
	}
	if len([]rune(in.Nueva)) < 6 {
		jsonErr(w, http.StatusBadRequest, "la nueva contraseña debe tener al menos 6 caracteres")
		return
	}
	if err := setPassword(in.Nueva); err != nil {
		serverErr(w, err)
		return
	}
	// Cierra todas las demás sesiones (por ejemplo, el celular).
	_, _ = db.Exec("DELETE FROM sessions")
	_ = newSession(w)
	writeJSON(w, map[string]bool{"ok": true})
}

// ---------- datos generales ----------

type Type struct {
	ID     int64           `json:"id"`
	Name   string          `json:"name"`
	Color  string          `json:"color"`
	Icon   string          `json:"icon"`
	Shape  string          `json:"shape"`
	Schema json.RawMessage `json:"schema"`
	Sort   int             `json:"sort"`
	Count  int             `json:"count"`
}

type Entity struct {
	ID      int64           `json:"id"`
	TypeID  int64           `json:"type_id"`
	Name    string          `json:"name"`
	PhotoID *int64          `json:"photo_id"`
	Tags    json.RawMessage `json:"tags"`
	Data    json.RawMessage `json:"data"`
	Created string          `json:"created"`
	Updated string          `json:"updated"`
}

type Relation struct {
	ID     int64  `json:"id"`
	FromID int64  `json:"from_id"`
	ToID   int64  `json:"to_id"`
	Label  string `json:"label"`
}

func hAll(w http.ResponseWriter, r *http.Request) {
	out := map[string]any{}

	types := []Type{}
	rows, err := db.Query(`SELECT t.id,t.name,t.color,t.icon,t.shape,t.schema,t.sort,
		(SELECT COUNT(*) FROM entities e WHERE e.type_id=t.id) FROM types t ORDER BY t.sort,t.id`)
	if err != nil {
		serverErr(w, err)
		return
	}
	for rows.Next() {
		var t Type
		var schema string
		if err := rows.Scan(&t.ID, &t.Name, &t.Color, &t.Icon, &t.Shape, &schema, &t.Sort, &t.Count); err != nil {
			rows.Close()
			serverErr(w, err)
			return
		}
		t.Schema = json.RawMessage(validJSON(schema, `{"sections":[]}`))
		types = append(types, t)
	}
	rows.Close()
	out["types"] = types

	ents := []Entity{}
	rows, err = db.Query(`SELECT id,type_id,name,photo_id,tags,data,created,updated FROM entities ORDER BY name COLLATE NOCASE`)
	if err != nil {
		serverErr(w, err)
		return
	}
	for rows.Next() {
		e, err := scanEntity(rows)
		if err != nil {
			rows.Close()
			serverErr(w, err)
			return
		}
		ents = append(ents, e)
	}
	rows.Close()
	out["entities"] = ents

	rels := []Relation{}
	rows, err = db.Query(`SELECT id,from_id,to_id,label FROM relations ORDER BY id`)
	if err != nil {
		serverErr(w, err)
		return
	}
	for rows.Next() {
		var x Relation
		if err := rows.Scan(&x.ID, &x.FromID, &x.ToID, &x.Label); err != nil {
			rows.Close()
			serverErr(w, err)
			return
		}
		rels = append(rels, x)
	}
	rows.Close()
	out["relations"] = rels

	writeJSON(w, out)
}

type scanner interface{ Scan(...any) error }

func scanEntity(s scanner) (Entity, error) {
	var e Entity
	var photo sql.NullInt64
	var tags, data string
	err := s.Scan(&e.ID, &e.TypeID, &e.Name, &photo, &tags, &data, &e.Created, &e.Updated)
	if photo.Valid {
		e.PhotoID = &photo.Int64
	}
	e.Tags = json.RawMessage(validJSON(tags, "[]"))
	e.Data = json.RawMessage(validJSON(data, "{}"))
	return e, err
}

func hInfo(w http.ResponseWriter, r *http.Request) {
	urls := []string{}
	if cfg.RedLocal {
		urls = lanURLs()
	}
	var size int64
	_ = filepath.WalkDir(dataDir, func(p string, d fs.DirEntry, err error) error {
		if err == nil && !d.IsDir() {
			if i, err := d.Info(); err == nil {
				size += i.Size()
			}
		}
		return nil
	})
	writeJSON(w, map[string]any{
		"version": version, "data_dir": dataDir, "urls": urls,
		"red_local": cfg.RedLocal, "puerto": cfg.Puerto, "size": size,
	})
}

func hQR(w http.ResponseWriter, r *http.Request) {
	text := r.URL.Query().Get("text")
	if text == "" || len(text) > 300 {
		jsonErr(w, http.StatusBadRequest, "texto inválido")
		return
	}
	q, err := qrcode.New(text, qrcode.Medium)
	if err != nil {
		serverErr(w, err)
		return
	}
	q.DisableBorder = false
	png, err := q.PNG(320)
	if err != nil {
		serverErr(w, err)
		return
	}
	w.Header().Set("Content-Type", "image/png")
	_, _ = w.Write(png)
}

// hSearch busca en notas/eventos de la línea de tiempo (las entidades se buscan en el navegador).
func hSearch(w http.ResponseWriter, r *http.Request) {
	q := strings.TrimSpace(r.URL.Query().Get("q"))
	type hit struct {
		EntityID int64  `json:"entity_id"`
		EventID  int64  `json:"event_id"`
		Title    string `json:"title"`
		Snippet  string `json:"snippet"`
		Date     string `json:"date"`
	}
	hits := []hit{}
	if len([]rune(q)) < 2 {
		writeJSON(w, hits)
		return
	}
	like := "%" + strings.NewReplacer(`\`, `\\`, "%", `\%`, "_", `\_`).Replace(q) + "%"
	rows, err := db.Query(`SELECT entity_id,id,title,body,date FROM events
		WHERE title LIKE ? ESCAPE '\' OR body LIKE ? ESCAPE '\' ORDER BY date DESC LIMIT 30`, like, like)
	if err != nil {
		serverErr(w, err)
		return
	}
	defer rows.Close()
	for rows.Next() {
		var h hit
		var body string
		if err := rows.Scan(&h.EntityID, &h.EventID, &h.Title, &body, &h.Date); err != nil {
			serverErr(w, err)
			return
		}
		h.Snippet = snippet(body, q)
		hits = append(hits, h)
	}
	writeJSON(w, hits)
}

func snippet(body, q string) string {
	rb := []rune(body)
	lb := []rune(strings.ToLower(body))
	lq := []rune(strings.ToLower(q))
	idx := -1
	for i := 0; i+len(lq) <= len(lb); i++ {
		if string(lb[i:i+len(lq)]) == string(lq) {
			idx = i
			break
		}
	}
	if idx < 0 {
		idx = 0
	}
	start := max(0, idx-40)
	end := min(len(rb), idx+len(lq)+60)
	s := string(rb[start:end])
	if start > 0 {
		s = "…" + s
	}
	if end < len(rb) {
		s += "…"
	}
	return s
}

// ---------- tipos ----------

var validShapes = map[string]bool{"ellipse": true, "round-rectangle": true, "hexagon": true, "diamond": true, "octagon": true, "round-triangle": true, "star": true}

func hTypeSave(w http.ResponseWriter, r *http.Request) {
	var in Type
	if !readJSON(w, r, &in) {
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" {
		jsonErr(w, http.StatusBadRequest, "el nombre es obligatorio")
		return
	}
	if !validShapes[in.Shape] {
		in.Shape = "ellipse"
	}
	schema := validJSON(string(in.Schema), `{"sections":[]}`)
	id := pathID(r)
	if r.Method == http.MethodPost {
		res, err := db.Exec(`INSERT INTO types(name,color,icon,shape,schema,sort)
			VALUES(?,?,?,?,?,(SELECT COALESCE(MAX(sort),0)+1 FROM types))`, in.Name, in.Color, in.Icon, in.Shape, schema)
		if err != nil {
			serverErr(w, err)
			return
		}
		id, _ = res.LastInsertId()
	} else {
		res, err := db.Exec(`UPDATE types SET name=?,color=?,icon=?,shape=?,schema=? WHERE id=?`,
			in.Name, in.Color, in.Icon, in.Shape, schema, id)
		if err != nil {
			serverErr(w, err)
			return
		}
		if n, _ := res.RowsAffected(); n == 0 {
			jsonErr(w, http.StatusNotFound, "tipo no encontrado")
			return
		}
	}
	writeJSON(w, map[string]int64{"id": id})
}

func hTypeDelete(w http.ResponseWriter, r *http.Request) {
	id := pathID(r)
	var n int
	_ = db.QueryRow("SELECT COUNT(*) FROM entities WHERE type_id=?", id).Scan(&n)
	if n > 0 {
		jsonErr(w, http.StatusConflict, fmt.Sprintf("no se puede borrar: hay %d registros de este tipo", n))
		return
	}
	if _, err := db.Exec("DELETE FROM types WHERE id=?", id); err != nil {
		serverErr(w, err)
		return
	}
	writeJSON(w, map[string]bool{"ok": true})
}

// ---------- entidades ----------

type Event struct {
	ID    int64  `json:"id"`
	Date  string `json:"date"`
	Kind  string `json:"kind"`
	Title string `json:"title"`
	Body  string `json:"body"`
}

type File struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	Mime     string `json:"mime"`
	Size     int64  `json:"size"`
	HasThumb bool   `json:"has_thumb"`
	Created  string `json:"created"`
}

func hEntityGet(w http.ResponseWriter, r *http.Request) {
	id := pathID(r)
	e, err := scanEntity(db.QueryRow(`SELECT id,type_id,name,photo_id,tags,data,created,updated FROM entities WHERE id=?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		jsonErr(w, http.StatusNotFound, "no encontrado")
		return
	} else if err != nil {
		serverErr(w, err)
		return
	}

	events := []Event{}
	rows, err := db.Query(`SELECT id,date,kind,title,body FROM events WHERE entity_id=? ORDER BY date DESC, id DESC`, id)
	if err != nil {
		serverErr(w, err)
		return
	}
	for rows.Next() {
		var ev Event
		if err := rows.Scan(&ev.ID, &ev.Date, &ev.Kind, &ev.Title, &ev.Body); err != nil {
			rows.Close()
			serverErr(w, err)
			return
		}
		events = append(events, ev)
	}
	rows.Close()

	files := []File{}
	rows, err = db.Query(`SELECT id,name,mime,size,thumb_path!='',created FROM files WHERE entity_id=? ORDER BY id DESC`, id)
	if err != nil {
		serverErr(w, err)
		return
	}
	for rows.Next() {
		var f File
		if err := rows.Scan(&f.ID, &f.Name, &f.Mime, &f.Size, &f.HasThumb, &f.Created); err != nil {
			rows.Close()
			serverErr(w, err)
			return
		}
		files = append(files, f)
	}
	rows.Close()

	writeJSON(w, map[string]any{"entity": e, "events": events, "files": files})
}

func hEntitySave(w http.ResponseWriter, r *http.Request) {
	var in struct {
		TypeID int64           `json:"type_id"`
		Name   string          `json:"name"`
		Tags   json.RawMessage `json:"tags"`
		Data   json.RawMessage `json:"data"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" {
		jsonErr(w, http.StatusBadRequest, "el nombre es obligatorio")
		return
	}
	tags := validJSON(string(in.Tags), "[]")
	data := validJSON(string(in.Data), "{}")
	t := now()
	id := pathID(r)
	if r.Method == http.MethodPost {
		res, err := db.Exec(`INSERT INTO entities(type_id,name,tags,data,created,updated) VALUES(?,?,?,?,?,?)`,
			in.TypeID, in.Name, tags, data, t, t)
		if err != nil {
			serverErr(w, err)
			return
		}
		id, _ = res.LastInsertId()
	} else {
		res, err := db.Exec(`UPDATE entities SET type_id=?,name=?,tags=?,data=?,updated=? WHERE id=?`,
			in.TypeID, in.Name, tags, data, t, id)
		if err != nil {
			serverErr(w, err)
			return
		}
		if n, _ := res.RowsAffected(); n == 0 {
			jsonErr(w, http.StatusNotFound, "no encontrado")
			return
		}
	}
	writeJSON(w, map[string]int64{"id": id})
}

func hEntityDelete(w http.ResponseWriter, r *http.Request) {
	id := pathID(r)
	if _, err := db.Exec("DELETE FROM entities WHERE id=?", id); err != nil {
		serverErr(w, err)
		return
	}
	_ = os.RemoveAll(filepath.Join(filesDir, strconv.FormatInt(id, 10)))
	writeJSON(w, map[string]bool{"ok": true})
}

func hEntityPhoto(w http.ResponseWriter, r *http.Request) {
	var in struct {
		FileID *int64 `json:"file_id"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	if _, err := db.Exec("UPDATE entities SET photo_id=?, updated=? WHERE id=?", in.FileID, now(), pathID(r)); err != nil {
		serverErr(w, err)
		return
	}
	writeJSON(w, map[string]bool{"ok": true})
}

// ---------- relaciones ----------

func hRelationSave(w http.ResponseWriter, r *http.Request) {
	var in Relation
	if !readJSON(w, r, &in) {
		return
	}
	if in.FromID == in.ToID || in.FromID == 0 || in.ToID == 0 {
		jsonErr(w, http.StatusBadRequest, "conexión inválida")
		return
	}
	in.Label = strings.TrimSpace(in.Label)
	id := pathID(r)
	if r.Method == http.MethodPost {
		res, err := db.Exec(`INSERT INTO relations(from_id,to_id,label,created) VALUES(?,?,?,?)`, in.FromID, in.ToID, in.Label, now())
		if err != nil {
			serverErr(w, err)
			return
		}
		id, _ = res.LastInsertId()
	} else if _, err := db.Exec(`UPDATE relations SET from_id=?,to_id=?,label=? WHERE id=?`, in.FromID, in.ToID, in.Label, id); err != nil {
		serverErr(w, err)
		return
	}
	writeJSON(w, map[string]int64{"id": id})
}

func hRelationDelete(w http.ResponseWriter, r *http.Request) {
	if _, err := db.Exec("DELETE FROM relations WHERE id=?", pathID(r)); err != nil {
		serverErr(w, err)
		return
	}
	writeJSON(w, map[string]bool{"ok": true})
}

// ---------- línea de tiempo ----------

func hEventSave(w http.ResponseWriter, r *http.Request) {
	var in Event
	if !readJSON(w, r, &in) {
		return
	}
	if strings.TrimSpace(in.Title) == "" && strings.TrimSpace(in.Body) == "" {
		jsonErr(w, http.StatusBadRequest, "escribe un título o una descripción")
		return
	}
	if in.Kind == "" {
		in.Kind = "nota"
	}
	id := pathID(r)
	if r.Method == http.MethodPost {
		res, err := db.Exec(`INSERT INTO events(entity_id,date,kind,title,body,created) VALUES(?,?,?,?,?,?)`,
			id, in.Date, in.Kind, in.Title, in.Body, now())
		if err != nil {
			serverErr(w, err)
			return
		}
		id, _ = res.LastInsertId()
	} else if _, err := db.Exec(`UPDATE events SET date=?,kind=?,title=?,body=? WHERE id=?`, in.Date, in.Kind, in.Title, in.Body, id); err != nil {
		serverErr(w, err)
		return
	}
	writeJSON(w, map[string]int64{"id": id})
}

func hEventDelete(w http.ResponseWriter, r *http.Request) {
	if _, err := db.Exec("DELETE FROM events WHERE id=?", pathID(r)); err != nil {
		serverErr(w, err)
		return
	}
	writeJSON(w, map[string]bool{"ok": true})
}

// ---------- archivos ----------

func saveUpload(src io.Reader, dir, name string) (int64, error) {
	f, err := os.OpenFile(filepath.Join(dir, name), os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
	if err != nil {
		return 0, err
	}
	n, err := io.Copy(f, src)
	if cerr := f.Close(); err == nil {
		err = cerr
	}
	return n, err
}

func hFileUpload(w http.ResponseWriter, r *http.Request) {
	eid := pathID(r)
	var exists int
	if err := db.QueryRow("SELECT COUNT(*) FROM entities WHERE id=?", eid).Scan(&exists); err != nil || exists == 0 {
		jsonErr(w, http.StatusNotFound, "registro no encontrado")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1<<30) // 1 GB por archivo
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		jsonErr(w, http.StatusBadRequest, "archivo inválido o demasiado grande")
		return
	}
	defer r.MultipartForm.RemoveAll()

	src, hdr, err := r.FormFile("file")
	if err != nil {
		jsonErr(w, http.StatusBadRequest, "falta el archivo")
		return
	}
	defer src.Close()

	rel := strconv.FormatInt(eid, 10)
	dir := filepath.Join(filesDir, rel)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		serverErr(w, err)
		return
	}
	ext := strings.ToLower(filepath.Ext(hdr.Filename))
	if len(ext) > 10 {
		ext = ""
	}
	base := time.Now().Format("20060102-150405") + "-" + randHex(4)
	name := base + ext
	size, err := saveUpload(src, dir, name)
	if err != nil {
		serverErr(w, err)
		return
	}

	mt := mime.TypeByExtension(ext)
	if mt == "" {
		head := make([]byte, 512)
		if f, err := os.Open(filepath.Join(dir, name)); err == nil {
			n, _ := f.Read(head)
			f.Close()
			mt = http.DetectContentType(head[:n])
		}
	}
	if i := strings.Index(mt, ";"); i > 0 {
		mt = mt[:i]
	}

	thumbRel := ""
	if th, _, err := r.FormFile("thumb"); err == nil {
		tn := base + "_t.jpg"
		if _, err := saveUpload(io.LimitReader(th, 4<<20), dir, tn); err == nil {
			thumbRel = rel + "/" + tn
		}
		th.Close()
	}

	origName := filepath.Base(strings.ReplaceAll(hdr.Filename, `\`, "/"))
	res, err := db.Exec(`INSERT INTO files(entity_id,name,mime,size,path,thumb_path,created) VALUES(?,?,?,?,?,?,?)`,
		eid, origName, mt, size, rel+"/"+name, thumbRel, now())
	if err != nil {
		serverErr(w, err)
		return
	}
	fid, _ := res.LastInsertId()

	if r.FormValue("foto") == "1" {
		_, _ = db.Exec("UPDATE entities SET photo_id=?, updated=? WHERE id=?", fid, now(), eid)
	}
	writeJSON(w, map[string]int64{"id": fid})
}

func hFileDelete(w http.ResponseWriter, r *http.Request) {
	id := pathID(r)
	var p, tp string
	if err := db.QueryRow("SELECT path,thumb_path FROM files WHERE id=?", id).Scan(&p, &tp); err != nil {
		jsonErr(w, http.StatusNotFound, "no encontrado")
		return
	}
	if _, err := db.Exec("DELETE FROM files WHERE id=?", id); err != nil {
		serverErr(w, err)
		return
	}
	_, _ = db.Exec("UPDATE entities SET photo_id=NULL WHERE photo_id=?", id)
	_ = os.Remove(filepath.Join(filesDir, filepath.FromSlash(p)))
	if tp != "" {
		_ = os.Remove(filepath.Join(filesDir, filepath.FromSlash(tp)))
	}
	writeJSON(w, map[string]bool{"ok": true})
}

func hFileServe(w http.ResponseWriter, r *http.Request) {
	var name, mt, p, tp string
	if err := db.QueryRow("SELECT name,mime,path,thumb_path FROM files WHERE id=?", pathID(r)).Scan(&name, &mt, &p, &tp); err != nil {
		http.NotFound(w, r)
		return
	}
	if strings.HasSuffix(r.URL.Path, "/thumb") && tp != "" {
		p, mt = tp, "image/jpeg"
	}
	f, err := os.Open(filepath.Join(filesDir, filepath.FromSlash(p)))
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer f.Close()
	st, _ := f.Stat()

	inline := strings.HasPrefix(mt, "image/") || strings.HasPrefix(mt, "video/") ||
		strings.HasPrefix(mt, "audio/") || mt == "application/pdf"
	if mt == "image/svg+xml" {
		inline = false // un SVG puede contener scripts
	}
	disp := "attachment"
	if inline {
		disp = "inline"
	}
	h := w.Header()
	h.Set("Content-Type", mt)
	h.Set("Content-Disposition", mime.FormatMediaType(disp, map[string]string{"filename": name}))
	if mt != "application/pdf" { // el visor de PDF del navegador no funciona en modo sandbox
		h.Set("Content-Security-Policy", "sandbox")
	}
	h.Set("Cache-Control", "private, max-age=86400")
	http.ServeContent(w, r, "", st.ModTime(), f)
}
