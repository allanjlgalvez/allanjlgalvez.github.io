package main

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

func openDB(path string) error {
	var err error
	dsn := "file:" + filepath.ToSlash(path) +
		"?_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=synchronous(NORMAL)"
	db, err = sql.Open("sqlite", dsn)
	if err != nil {
		return err
	}
	db.SetMaxOpenConns(4)
	if err := db.Ping(); err != nil {
		return err
	}
	return migrate()
}

var migrations = []string{
	// v1
	`
CREATE TABLE types (
  id     INTEGER PRIMARY KEY,
  name   TEXT NOT NULL,
  color  TEXT NOT NULL DEFAULT '#00f0ff',
  icon   TEXT NOT NULL DEFAULT 'person',
  shape  TEXT NOT NULL DEFAULT 'ellipse',
  schema TEXT NOT NULL DEFAULT '{"sections":[]}',
  sort   INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE entities (
  id       INTEGER PRIMARY KEY,
  type_id  INTEGER NOT NULL REFERENCES types(id),
  name     TEXT NOT NULL,
  photo_id INTEGER,
  tags     TEXT NOT NULL DEFAULT '[]',
  data     TEXT NOT NULL DEFAULT '{}',
  created  TEXT NOT NULL,
  updated  TEXT NOT NULL
);
CREATE INDEX entities_type ON entities(type_id);
CREATE TABLE relations (
  id      INTEGER PRIMARY KEY,
  from_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  to_id   INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  label   TEXT NOT NULL DEFAULT '',
  created TEXT NOT NULL
);
CREATE INDEX relations_from ON relations(from_id);
CREATE INDEX relations_to ON relations(to_id);
CREATE TABLE events (
  id        INTEGER PRIMARY KEY,
  entity_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  date      TEXT NOT NULL DEFAULT '',
  kind      TEXT NOT NULL DEFAULT 'nota',
  title     TEXT NOT NULL DEFAULT '',
  body      TEXT NOT NULL DEFAULT '',
  created   TEXT NOT NULL
);
CREATE INDEX events_entity ON events(entity_id);
CREATE TABLE files (
  id         INTEGER PRIMARY KEY,
  entity_id  INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  mime       TEXT NOT NULL,
  size       INTEGER NOT NULL,
  path       TEXT NOT NULL,
  thumb_path TEXT NOT NULL DEFAULT '',
  created    TEXT NOT NULL
);
CREATE INDEX files_entity ON files(entity_id);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE sessions (token TEXT PRIMARY KEY, expires INTEGER NOT NULL);
`,
	// v2: papelera y verificación (Depurador de contactos)
	`
ALTER TABLE entities ADD COLUMN deleted_at TEXT NOT NULL DEFAULT '';
ALTER TABLE entities ADD COLUMN verified TEXT NOT NULL DEFAULT '';
CREATE INDEX entities_deleted ON entities(deleted_at);
`,
}

func migrate() error {
	var v int
	if err := db.QueryRow("PRAGMA user_version").Scan(&v); err != nil {
		return err
	}
	for i := v; i < len(migrations); i++ {
		tx, err := db.Begin()
		if err != nil {
			return err
		}
		if _, err := tx.Exec(migrations[i]); err != nil {
			tx.Rollback()
			return fmt.Errorf("migración %d: %w", i+1, err)
		}
		if i == 0 {
			if err := seed(tx); err != nil {
				tx.Rollback()
				return err
			}
		}
		if _, err := tx.Exec(fmt.Sprintf("PRAGMA user_version = %d", i+1)); err != nil {
			tx.Rollback()
			return err
		}
		if err := tx.Commit(); err != nil {
			return err
		}
	}
	return nil
}

func seed(tx *sql.Tx) error {
	types := []struct{ name, color, icon, shape, schema string }{
		{"Persona", "#00f0ff", "person", "ellipse", schemaPersona},
		{"Vehículo", "#f99e1a", "car", "round-rectangle", schemaVehiculo},
		{"Mascota", "#ff2a6d", "paw", "hexagon", schemaMascota},
	}
	for i, t := range types {
		if _, err := tx.Exec(`INSERT INTO types(name,color,icon,shape,schema,sort) VALUES(?,?,?,?,?,?)`,
			t.name, t.color, t.icon, t.shape, compactJSON(t.schema), i); err != nil {
			return err
		}
	}
	return nil
}

func compactJSON(s string) string {
	return strings.Join(strings.Fields(s), " ")
}

const schemaPersona = `{"sections":[
 {"id":"general","label":"General","fields":[
  {"key":"apodo","label":"Apodo","type":"text"},
  {"key":"fecha_nacimiento","label":"Fecha de nacimiento","type":"date"},
  {"key":"genero","label":"Género","type":"select","options":["Masculino","Femenino","Otro"]},
  {"key":"ocupacion","label":"Ocupación","type":"text"},
  {"key":"empresa","label":"Empresa / escuela","type":"text"},
  {"key":"como_nos_conocimos","label":"Cómo nos conocimos","type":"textarea"}]},
 {"id":"contacto","label":"Contacto","fields":[
  {"key":"telefono","label":"Teléfono","type":"phone"},
  {"key":"telefono_2","label":"Teléfono alterno","type":"phone"},
  {"key":"email","label":"Correo","type":"email"},
  {"key":"direccion","label":"Dirección","type":"textarea"},
  {"key":"instagram","label":"Instagram","type":"text"},
  {"key":"facebook","label":"Facebook","type":"text"}]},
 {"id":"medico","label":"Médico","fields":[
  {"key":"tipo_sangre","label":"Tipo de sangre","type":"select","options":["O+","O-","A+","A-","B+","B-","AB+","AB-"]},
  {"key":"alergias","label":"Alergias","type":"textarea"},
  {"key":"padecimientos","label":"Padecimientos / condiciones","type":"textarea"},
  {"key":"medicamentos","label":"Medicamentos","type":"textarea"},
  {"key":"medico","label":"Médico de cabecera","type":"text"},
  {"key":"telefono_medico","label":"Teléfono del médico","type":"phone"},
  {"key":"seguro_medico","label":"Seguro médico","type":"text"},
  {"key":"poliza_seguro","label":"Póliza","type":"text"},
  {"key":"contacto_emergencia","label":"Contacto de emergencia","type":"text"},
  {"key":"donante","label":"Donante de órganos","type":"checkbox"}]},
 {"id":"preferencias","label":"Gustos","fields":[
  {"key":"comida_favorita","label":"Comida favorita","type":"text"},
  {"key":"no_le_gusta","label":"No le gusta","type":"textarea"},
  {"key":"hobbies","label":"Hobbies","type":"textarea"},
  {"key":"ideas_regalo","label":"Ideas de regalo","type":"textarea"},
  {"key":"talla_ropa","label":"Talla de ropa","type":"text"},
  {"key":"talla_zapato","label":"Talla de zapato","type":"text"}]}
]}`

const schemaVehiculo = `{"sections":[
 {"id":"general","label":"Vehículo","fields":[
  {"key":"marca","label":"Marca","type":"text"},
  {"key":"modelo","label":"Modelo","type":"text"},
  {"key":"anio","label":"Año","type":"number"},
  {"key":"color","label":"Color","type":"text"},
  {"key":"placas","label":"Placas","type":"text"},
  {"key":"estado_placas","label":"Estado de las placas","type":"text"},
  {"key":"vin","label":"NIV / VIN","type":"text"}]},
 {"id":"seguro","label":"Seguro","fields":[
  {"key":"aseguradora","label":"Aseguradora","type":"text"},
  {"key":"poliza","label":"Póliza","type":"text"},
  {"key":"vigencia_seguro","label":"Vigencia","type":"date"}]},
 {"id":"notas","label":"Notas","fields":[
  {"key":"notas","label":"Notas","type":"textarea"}]}
]}`

const schemaMascota = `{"sections":[
 {"id":"general","label":"Mascota","fields":[
  {"key":"especie","label":"Especie","type":"select","options":["Perro","Gato","Ave","Otro"]},
  {"key":"raza","label":"Raza","type":"text"},
  {"key":"fecha_nacimiento","label":"Fecha de nacimiento","type":"date"},
  {"key":"color","label":"Color","type":"text"}]},
 {"id":"salud","label":"Salud","fields":[
  {"key":"veterinario","label":"Veterinario","type":"text"},
  {"key":"telefono_veterinario","label":"Teléfono del veterinario","type":"phone"},
  {"key":"vacunas","label":"Vacunas","type":"textarea"},
  {"key":"notas","label":"Notas","type":"textarea"}]}
]}`

func now() string { return time.Now().Format(time.RFC3339) }

// autoBackup guarda una copia diaria de la base (sin archivos) y conserva las 10 más recientes.
func autoBackup() {
	dir := filepath.Join(dataDir, "respaldos", "auto")
	name := filepath.Join(dir, "nexus-"+time.Now().Format("2006-01-02")+".db")
	if _, err := os.Stat(name); err == nil {
		return
	}
	if _, err := db.Exec("VACUUM INTO ?", name); err != nil {
		fmt.Println("  Aviso: no se pudo crear el respaldo automático:", err)
		return
	}
	matches, _ := filepath.Glob(filepath.Join(dir, "nexus-*.db"))
	sort.Strings(matches)
	for len(matches) > 10 {
		os.Remove(matches[0])
		matches = matches[1:]
	}
}
