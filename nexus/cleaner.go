package main

// Depurador de contactos: papelera, verificación, fusión de duplicados y exportación.

import (
	"database/sql"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode"
)

// ---------- papelera ----------

func trashIDs(ids []int64) error {
	t := now()
	for _, id := range ids {
		if _, err := db.Exec("UPDATE entities SET deleted_at=? WHERE id=? AND deleted_at=''", t, id); err != nil {
			return err
		}
	}
	return nil
}

type idsIn struct {
	IDs []int64 `json:"ids"`
	All bool    `json:"all"`
}

func hTrashList(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Query(`SELECT ` + entityCols + ` FROM entities WHERE deleted_at!='' ORDER BY deleted_at DESC, name COLLATE NOCASE`)
	if err != nil {
		serverErr(w, err)
		return
	}
	defer rows.Close()
	out := []Entity{}
	for rows.Next() {
		e, err := scanEntity(rows)
		if err != nil {
			serverErr(w, err)
			return
		}
		out = append(out, e)
	}
	writeJSON(w, out)
}

func hTrash(w http.ResponseWriter, r *http.Request) {
	var in idsIn
	if !readJSON(w, r, &in) {
		return
	}
	if err := trashIDs(in.IDs); err != nil {
		serverErr(w, err)
		return
	}
	writeJSON(w, map[string]int{"count": len(in.IDs)})
}

func hTrashRestore(w http.ResponseWriter, r *http.Request) {
	var in idsIn
	if !readJSON(w, r, &in) {
		return
	}
	for _, id := range in.IDs {
		if _, err := db.Exec("UPDATE entities SET deleted_at='' WHERE id=?", id); err != nil {
			serverErr(w, err)
			return
		}
	}
	writeJSON(w, map[string]int{"count": len(in.IDs)})
}

// hTrashPurge borra definitivamente registros que ya están en la papelera.
func hTrashPurge(w http.ResponseWriter, r *http.Request) {
	var in idsIn
	if !readJSON(w, r, &in) {
		return
	}
	ids := in.IDs
	if in.All {
		ids = nil
		rows, err := db.Query("SELECT id FROM entities WHERE deleted_at!=''")
		if err != nil {
			serverErr(w, err)
			return
		}
		for rows.Next() {
			var id int64
			rows.Scan(&id)
			ids = append(ids, id)
		}
		rows.Close()
	}
	n := 0
	for _, id := range ids {
		var del string
		if err := db.QueryRow("SELECT deleted_at FROM entities WHERE id=?", id).Scan(&del); err != nil || del == "" {
			continue // solo se purga lo que está en la papelera
		}
		// Archivos que pertenecen a este registro (por fila, no por carpeta:
		// una fusión pudo haber movido archivos entre registros).
		var paths []string
		rows, err := db.Query("SELECT path,thumb_path FROM files WHERE entity_id=?", id)
		if err != nil {
			serverErr(w, err)
			return
		}
		for rows.Next() {
			var p, tp string
			rows.Scan(&p, &tp)
			paths = append(paths, p, tp)
		}
		rows.Close()
		if _, err := db.Exec("DELETE FROM entities WHERE id=?", id); err != nil {
			serverErr(w, err)
			return
		}
		for _, p := range paths {
			if p != "" {
				_ = os.Remove(filepath.Join(filesDir, filepath.FromSlash(p)))
			}
		}
		_ = os.Remove(filepath.Join(filesDir, strconv.FormatInt(id, 10))) // solo si quedó vacía
		n++
	}
	writeJSON(w, map[string]int{"count": n})
}

func hVerify(w http.ResponseWriter, r *http.Request) {
	var in struct {
		IDs   []int64 `json:"ids"`
		Value bool    `json:"value"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	v := ""
	if in.Value {
		v = now()
	}
	for _, id := range in.IDs {
		if _, err := db.Exec("UPDATE entities SET verified=? WHERE id=?", v, id); err != nil {
			serverErr(w, err)
			return
		}
	}
	writeJSON(w, map[string]int{"count": len(in.IDs)})
}

// ---------- fusión ----------

type schemaT struct {
	Sections []struct {
		Label  string `json:"label"`
		Fields []struct {
			Key   string `json:"key"`
			Label string `json:"label"`
			Type  string `json:"type"`
		} `json:"fields"`
	} `json:"sections"`
}

type fieldInfo struct{ key, label, typ string }

func typeFields(typeID int64) []fieldInfo {
	var raw string
	_ = db.QueryRow("SELECT schema FROM types WHERE id=?", typeID).Scan(&raw)
	var s schemaT
	_ = json.Unmarshal([]byte(raw), &s)
	var out []fieldInfo
	for _, sec := range s.Sections {
		for _, f := range sec.Fields {
			out = append(out, fieldInfo{f.Key, f.Label, f.Type})
		}
	}
	return out
}

var (
	nonDigits = regexp.MustCompile(`\D`)
	isoDate   = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
)

func phoneKey(v string) string {
	d := nonDigits.ReplaceAllString(v, "")
	if len(d) > 10 {
		d = d[len(d)-10:]
	}
	return d
}

func strVal(v any) string {
	switch x := v.(type) {
	case nil:
		return ""
	case string:
		return strings.TrimSpace(x)
	case bool:
		if x {
			return "Sí"
		}
		return ""
	default:
		return strings.TrimSpace(fmt.Sprint(x))
	}
}

func hasLetters(s string) bool {
	for _, r := range s {
		if unicode.IsLetter(r) {
			return true
		}
	}
	return false
}

type fullEntity struct {
	Entity
	data map[string]any
	tags []string
}

func loadFull(q interface {
	QueryRow(string, ...any) *sql.Row
}, id int64) (*fullEntity, error) {
	e, err := scanEntity(q.QueryRow(`SELECT `+entityCols+` FROM entities WHERE id=?`, id))
	if err != nil {
		return nil, err
	}
	f := &fullEntity{Entity: e, data: map[string]any{}}
	_ = json.Unmarshal(e.Data, &f.data)
	_ = json.Unmarshal(e.Tags, &f.tags)
	return f, nil
}

// hMerge fusiona varios registros en uno: llena los datos vacíos, junta
// etiquetas, conexiones, línea de tiempo y archivos, guarda los datos en
// conflicto como nota, y manda los duplicados a la papelera.
func hMerge(w http.ResponseWriter, r *http.Request) {
	var in struct {
		KeepID int64   `json:"keep_id"`
		IDs    []int64 `json:"ids"`
	}
	if !readJSON(w, r, &in) {
		return
	}
	tx, err := db.Begin()
	if err != nil {
		serverErr(w, err)
		return
	}
	defer tx.Rollback()

	keep, err := loadFull(tx, in.KeepID)
	if err != nil || keep.Deleted != "" {
		jsonErr(w, http.StatusNotFound, "el registro a conservar no existe")
		return
	}
	fields := typeFields(keep.TypeID)
	ftype := map[string]string{}
	for _, f := range fields {
		ftype[f.key] = f.typ
	}
	sameKind := func(typ string) []string {
		var ks []string
		for _, f := range fields {
			if f.typ == typ {
				ks = append(ks, f.key)
			}
		}
		return ks
	}
	norm := func(typ, v string) string {
		if typ == "phone" {
			return phoneKey(v)
		}
		return strings.ToLower(strings.TrimSpace(v))
	}
	// ¿Ya existe este valor en algún campo del mismo tipo?
	already := func(typ, v string) bool {
		nv := norm(typ, v)
		for _, k := range sameKind(typ) {
			if norm(typ, strVal(keep.data[k])) == nv && nv != "" {
				return true
			}
		}
		return false
	}

	var conflicts []string
	merged := 0
	tags := map[string]bool{}
	for _, t := range keep.tags {
		tags[t] = true
	}
	for _, id := range in.IDs {
		if id == keep.ID {
			continue
		}
		dup, err := loadFull(tx, id)
		if err != nil || dup.Deleted != "" {
			continue
		}
		// Nombre
		if !hasLetters(keep.Name) && hasLetters(dup.Name) {
			conflicts = append(conflicts, "Nombre anterior: "+keep.Name)
			keep.Name = dup.Name
		} else if !strings.EqualFold(strings.TrimSpace(dup.Name), strings.TrimSpace(keep.Name)) {
			conflicts = append(conflicts, "Otro nombre: "+dup.Name)
		}
		// Datos (orden estable para que el resultado sea predecible)
		keys := make([]string, 0, len(dup.data))
		for k := range dup.data {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for _, k := range keys {
			v := dup.data[k]
			sv := strVal(v)
			if sv == "" {
				continue
			}
			typ := ftype[k]
			if typ == "phone" || typ == "email" {
				if already(typ, sv) {
					continue
				}
			}
			if strVal(keep.data[k]) == "" {
				keep.data[k] = v
				continue
			}
			if norm(typ, strVal(keep.data[k])) == norm(typ, sv) {
				continue
			}
			placed := false
			if typ == "phone" || typ == "email" {
				for _, k2 := range sameKind(typ) {
					if strVal(keep.data[k2]) == "" {
						keep.data[k2] = sv
						placed = true
						break
					}
				}
			}
			if !placed {
				label := k
				for _, f := range fields {
					if f.key == k {
						label = f.label
					}
				}
				conflicts = append(conflicts, label+": "+sv)
			}
		}
		for _, t := range dup.tags {
			tags[t] = true
		}
		if keep.PhotoID == nil && dup.PhotoID != nil {
			keep.PhotoID = dup.PhotoID
		}
		// Mover conexiones, línea de tiempo y archivos
		for _, q := range []string{
			"UPDATE relations SET from_id=? WHERE from_id=?",
			"UPDATE relations SET to_id=? WHERE to_id=?",
			"UPDATE events SET entity_id=? WHERE entity_id=?",
			"UPDATE files SET entity_id=? WHERE entity_id=?",
		} {
			if _, err := tx.Exec(q, keep.ID, dup.ID); err != nil {
				serverErr(w, err)
				return
			}
		}
		dup.data["_fusionado_con"] = fmt.Sprintf("%s (#%d)", keep.Name, keep.ID)
		dj, _ := json.Marshal(dup.data)
		if _, err := tx.Exec("UPDATE entities SET deleted_at=?, photo_id=NULL, data=? WHERE id=?", now(), string(dj), dup.ID); err != nil {
			serverErr(w, err)
			return
		}
		merged++
	}
	if merged == 0 {
		jsonErr(w, http.StatusBadRequest, "no hay registros para fusionar")
		return
	}
	// Limpiar conexiones que quedaron consigo mismo o repetidas
	if _, err := tx.Exec("DELETE FROM relations WHERE from_id=to_id"); err != nil {
		serverErr(w, err)
		return
	}
	if _, err := tx.Exec(`DELETE FROM relations WHERE id NOT IN (SELECT MIN(id) FROM relations GROUP BY from_id,to_id,label)`); err != nil {
		serverErr(w, err)
		return
	}
	if len(conflicts) > 0 {
		body := "Datos de los contactos fusionados que no cabían en los campos:\n" + strings.Join(conflicts, "\n")
		if _, err := tx.Exec(`INSERT INTO events(entity_id,date,kind,title,body,created) VALUES(?,?,?,?,?,?)`,
			keep.ID, time.Now().Format("2006-01-02"), "nota", "Contactos fusionados", body, now()); err != nil {
			serverErr(w, err)
			return
		}
	}
	tl := make([]string, 0, len(tags))
	for t := range tags {
		tl = append(tl, t)
	}
	sort.Strings(tl)
	tj, _ := json.Marshal(tl)
	dj, _ := json.Marshal(keep.data)
	if _, err := tx.Exec("UPDATE entities SET name=?, data=?, tags=?, photo_id=?, updated=? WHERE id=?",
		keep.Name, string(dj), string(tj), keep.PhotoID, now(), keep.ID); err != nil {
		serverErr(w, err)
		return
	}
	if err := tx.Commit(); err != nil {
		serverErr(w, err)
		return
	}
	writeJSON(w, map[string]any{"id": keep.ID, "merged": merged, "conflicts": len(conflicts)})
}

// ---------- exportación ----------

func activeEntities(typeID int64) ([]*fullEntity, error) {
	q := `SELECT ` + entityCols + ` FROM entities WHERE deleted_at=''`
	args := []any{}
	if typeID > 0 {
		q += " AND type_id=?"
		args = append(args, typeID)
	}
	rows, err := db.Query(q+" ORDER BY name COLLATE NOCASE", args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*fullEntity
	for rows.Next() {
		e, err := scanEntity(rows)
		if err != nil {
			return nil, err
		}
		f := &fullEntity{Entity: e, data: map[string]any{}}
		_ = json.Unmarshal(e.Data, &f.data)
		_ = json.Unmarshal(e.Tags, &f.tags)
		out = append(out, f)
	}
	return out, nil
}

// splitName separa un nombre completo en nombre(s) y apellidos (estilo mexicano).
func splitName(full string) (first, middle, last string) {
	if !hasLetters(full) {
		return "", "", "" // sin nombre real (p. ej. solo un teléfono): Google mostrará el número
	}
	t := strings.Fields(full)
	switch {
	case len(t) == 0:
		return "", "", ""
	case len(t) == 1:
		return t[0], "", ""
	case len(t) == 2:
		return t[0], "", t[1]
	case len(t) == 3:
		return t[0], "", t[1] + " " + t[2]
	default:
		return t[0], strings.Join(t[1:len(t)-2], " "), t[len(t)-2] + " " + t[len(t)-1]
	}
}

// hExportCSV genera un CSV con el formato de Google Contactos (sin la papelera).
// Solo incluye datos de contacto: nunca datos médicos ni notas privadas.
func hExportCSV(w http.ResponseWriter, r *http.Request) {
	typeID, _ := strconv.ParseInt(r.URL.Query().Get("type"), 10, 64)
	ents, err := activeEntities(typeID)
	if err != nil {
		serverErr(w, err)
		return
	}
	fieldsByType := map[int64][]fieldInfo{}
	keysOf := func(e *fullEntity, typ string) []string {
		fs, ok := fieldsByType[e.TypeID]
		if !ok {
			fs = typeFields(e.TypeID)
			fieldsByType[e.TypeID] = fs
		}
		var out []string
		for _, f := range fs {
			if f.typ == typ {
				if v := strVal(e.data[f.key]); v != "" {
					out = append(out, v)
				}
			}
		}
		return out
	}
	maxP, maxE := 1, 1
	for _, e := range ents {
		maxP = max(maxP, len(keysOf(e, "phone")))
		maxE = max(maxE, len(keysOf(e, "email")))
	}
	head := []string{"First Name", "Middle Name", "Last Name", "Nickname", "Organization Name", "Organization Title", "Birthday", "Notes", "Labels"}
	for i := 1; i <= maxE; i++ {
		head = append(head, fmt.Sprintf("E-mail %d - Label", i), fmt.Sprintf("E-mail %d - Value", i))
	}
	for i := 1; i <= maxP; i++ {
		head = append(head, fmt.Sprintf("Phone %d - Label", i), fmt.Sprintf("Phone %d - Value", i))
	}
	head = append(head, "Address 1 - Label", "Address 1 - Formatted")

	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="nexus-contactos-google-`+time.Now().Format("2006-01-02")+`.csv"`)
	cw := csv.NewWriter(w)
	_ = cw.Write(head)
	for _, e := range ents {
		first, middle, last := splitName(e.Name)
		labels := []string{"* myContacts"}
		for _, t := range e.tags {
			if t != "" && t != "google" { // «google» solo marcaba los importados
				rs := []rune(t)
				labels = append(labels, strings.ToUpper(string(rs[:1]))+string(rs[1:]))
			}
		}
		bday := strVal(e.data["fecha_nacimiento"])
		if !isoDate.MatchString(bday) {
			bday = ""
		}
		row := []string{first, middle, last, strVal(e.data["apodo"]), strVal(e.data["empresa"]), strVal(e.data["ocupacion"]), bday, "", strings.Join(labels, " ::: ")}
		em := keysOf(e, "email")
		for i := 0; i < maxE; i++ {
			if i < len(em) {
				l := "Home"
				if i > 0 {
					l = "Other"
				}
				row = append(row, l, em[i])
			} else {
				row = append(row, "", "")
			}
		}
		ph := keysOf(e, "phone")
		for i := 0; i < maxP; i++ {
			if i < len(ph) {
				l := "Mobile"
				if i > 0 {
					l = "Other"
				}
				row = append(row, l, ph[i])
			} else {
				row = append(row, "", "")
			}
		}
		addr := strVal(e.data["direccion"])
		if addr != "" {
			row = append(row, "Home", addr)
		} else {
			row = append(row, "", "")
		}
		_ = cw.Write(row)
	}
	cw.Flush()
}

// hExportJSON exporta toda la base activa (sin papelera) en JSON.
func hExportJSON(w http.ResponseWriter, r *http.Request) {
	ents, err := activeEntities(0)
	if err != nil {
		serverErr(w, err)
		return
	}
	type evOut struct {
		Date  string `json:"date"`
		Kind  string `json:"kind"`
		Title string `json:"title"`
		Body  string `json:"body"`
	}
	type entOut struct {
		ID       int64           `json:"id"`
		Type     string          `json:"type"`
		Name     string          `json:"name"`
		Tags     json.RawMessage `json:"tags"`
		Data     json.RawMessage `json:"data"`
		Verified string          `json:"verified,omitempty"`
		Created  string          `json:"created"`
		Updated  string          `json:"updated"`
		Events   []evOut         `json:"events"`
		Files    []string        `json:"files"`
	}
	typeNames := map[int64]string{}
	trows, err := db.Query("SELECT id,name FROM types")
	if err == nil {
		for trows.Next() {
			var id int64
			var n string
			trows.Scan(&id, &n)
			typeNames[id] = n
		}
		trows.Close()
	}
	out := []entOut{}
	active := map[int64]bool{}
	for _, e := range ents {
		active[e.ID] = true
		o := entOut{ID: e.ID, Type: typeNames[e.TypeID], Name: e.Name, Tags: e.Tags, Data: e.Data, Verified: e.Verified, Created: e.Created, Updated: e.Updated, Events: []evOut{}, Files: []string{}}
		erows, err := db.Query("SELECT date,kind,title,body FROM events WHERE entity_id=? ORDER BY date,id", e.ID)
		if err == nil {
			for erows.Next() {
				var ev evOut
				erows.Scan(&ev.Date, &ev.Kind, &ev.Title, &ev.Body)
				o.Events = append(o.Events, ev)
			}
			erows.Close()
		}
		frows, err := db.Query("SELECT name FROM files WHERE entity_id=? ORDER BY id", e.ID)
		if err == nil {
			for frows.Next() {
				var n string
				frows.Scan(&n)
				o.Files = append(o.Files, n)
			}
			frows.Close()
		}
		out = append(out, o)
	}
	type relOut struct {
		From  int64  `json:"from"`
		To    int64  `json:"to"`
		Label string `json:"label"`
	}
	rels := []relOut{}
	rrows, err := db.Query("SELECT from_id,to_id,label FROM relations ORDER BY id")
	if err == nil {
		for rrows.Next() {
			var x relOut
			rrows.Scan(&x.From, &x.To, &x.Label)
			if active[x.From] && active[x.To] {
				rels = append(rels, x)
			}
		}
		rrows.Close()
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="nexus-base-limpia-`+time.Now().Format("2006-01-02")+`.json"`)
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	_ = enc.Encode(map[string]any{
		"app": "NEXUS", "version": version, "exportado": now(),
		"registros": out, "conexiones": rels,
	})
}
