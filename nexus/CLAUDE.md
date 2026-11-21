# NEXUS — contexto para Claude Code

NEXUS es la base de datos personal de contactos de Allan: familia y amigos,
datos médicos, vehículos que manejan, mascotas, fotos, documentos, notas y
relaciones mostradas como diagrama. Es **100 % local y portable**: un solo
`nexus.exe` más la carpeta `datos/` junto a él. Allan usa **Windows**, lo tiene
en **`D:\Nexus`** y lo consulta desde el celular en su Wi-Fi de casa.

Toda la interfaz, los textos y los mensajes de commit van **en español**.

## Reglas importantes

- **Los datos reales viven en `D:\Nexus\datos\`. Nunca los borres, muevas ni
  modifiques en pruebas, y nunca los subas a git.** Para probar usa otra
  carpeta: `-datos D:\Nexus\pruebas`.
- El repositorio (`allanjlgalvez/allanjlgalvez.github.io`) es **público** y es
  su sitio de GitHub Pages. NEXUS vive en la rama **`ccr-04ee6d84-hyehhm`**,
  carpeta `nexus/`. **No la unas a `main`**: se publicaría en su sitio.
- Nada de datos personales, contraseñas ni rutas privadas en commits.
- Sin dependencias pesadas: Go puro (sin CGO) y JavaScript sin frameworks ni
  paso de compilación. La interfaz va incrustada en el `.exe` con `go:embed`,
  así que **cualquier cambio en `web/` requiere recompilar**.

## Estructura

```
D:\Nexus\
├── nexus.exe            ← programa en uso (lo instala/actualiza actualizar.bat)
├── actualizar.bat       ← descarga la última versión publicada en GitHub
├── datos\               ← DATOS REALES: nexus.db, archivos\, respaldos\, config.json
└── codigo\              ← este repositorio (rama ccr-04ee6d84-hyehhm)
    ├── .github\workflows\nexus.yml   ← compila y publica nexus.exe en cada push
    └── nexus\
        ├── main.go        arranque, config.json, IPs de la red local, abrir navegador
        ├── db.go          esquema SQLite + migraciones (PRAGMA user_version) + tipos iniciales
        ├── api.go         rutas REST, cabeceras de seguridad, archivos
        ├── auth.go        contraseña bcrypt, sesiones en BD (cookie nexus_s), límite de intentos
        ├── backup.go      respaldo .nexus (scrypt + AES-256-GCM por bloques) y -restaurar
        ├── importer.go    descarga de fotos de Google (solo *.googleusercontent.com / *.ggpht.com)
        ├── console_windows.go  consola UTF-8 y título en Windows
        ├── web\index.html, app.css, app.js, import.js, vendor\ (cytoscape 3.35, fuentes Rajdhani/Orbitron)
        ├── actualizar.bat (CRLF, sin acentos), build.sh, LEEME.md (manual para Allan)
        └── dev\seed.py    carga datos ficticios de prueba
```

## Arquitectura

- **Modelo genérico y configurable** (así Allan puede agregar campos sin código):
  - `types`: tipos de registro (Persona, Vehículo, Mascota…) con `color`, `icon`,
    `shape` (forma del nodo en Cytoscape) y `schema` JSON:
    `{"sections":[{"id","label","fields":[{"key","label","type","options"}]}]}`.
    Tipos de campo: text, textarea, number, date, select, phone, email, url, checkbox.
  - `entities`: `name`, `photo_id`, `tags` (JSON array), `data` (JSON objeto `key → valor`).
  - `relations` (dirigidas: `from_id —label→ to_id`), `events` (línea de tiempo),
    `files` (en `datos/archivos/<entity_id>/`, miniatura opcional `_t.jpg`),
    `settings` (hash de contraseña), `sessions`.
  - Las claves de campo son inmutables; si se quita un campo, sus datos se
    muestran en la pestaña «Otros datos». Claves usadas por la interfaz:
    `fecha_nacimiento` (cumpleaños), `telefono`, `telefono_2`, `email`,
    `direccion`, `empresa`, `ocupacion`, `apodo`, `alergias`/`padecimientos`/`tipo_sangre` (resaltados).
- **Cambios de esquema**: agregar una cadena nueva al final de `migrations` en
  `db.go`; nunca editar las existentes.
- **API**: `GET /api/all` devuelve tipos + entidades + relaciones; el navegador
  guarda todo en memoria (`S`) y busca del lado del cliente. Toda petición que no
  sea GET debe traer la cabecera `X-Nexus: 1` (protección CSRF) y la cookie de
  sesión. Los archivos se sirven con `Content-Security-Policy: sandbox`.
- **Frontend** (`app.js`): `h(tag, props, ...hijos)` crea el DOM (los hijos se
  agregan antes que las props, para que `value` de `<select>` funcione); `ic(nombre)`
  da íconos SVG; `api()`, `modal()`, `confirmDlg()`, `toast()`; router por hash:
  `#/red`, `#/lista`, `#/e/:id`, `#/e/:id/editar`, `#/ajustes`, `#/tipo/:id|nuevo`.
  `import.js` contiene el importador vCard/CSV y usa las funciones globales de `app.js`.
- **Diagramas (Cytoscape)**: crear siempre con `makeCy()` y `runLayout()`; al
  cambiar de pantalla `destroyCys()` detiene animaciones antes de destruir
  (si no, aparece `Cannot read properties of null (reading 'notify')`). El
  layout `cose` usa `animate: 'end'` por esa misma razón. Los íconos SVG en data
  URI necesitan `width`/`height` o se ven cortados en el lienzo.
- **Estilo**: oscuro, HUD cyberpunk; cian `#00f0ff`, magenta `#ff2a6d`, amarillo
  `#fcee0a`, naranja `#f99e1a`; esquinas recortadas (`.cut`), botones en
  paralelogramo (`.btn`), títulos en Orbitron, texto en Rajdhani. Debe verse bien
  en celular (navegación inferior bajo 860 px).

## Comandos (Windows)

Requisitos: `winget install GoLang.Go Git.Git` (Go 1.26+, lo pide `go.mod`).
Opcional para pruebas: Python 3 con Pillow, y Node con Playwright.

```bat
cd D:\Nexus\codigo\nexus
go vet ./...
go build -o D:\Nexus\pruebas\nexus.exe .

rem Probar SIN tocar los datos reales (otro puerto para no chocar con el NEXUS abierto):
mkdir D:\Nexus\pruebas\datos
echo {"puerto":8790,"red_local":false,"abrir_navegador":true}> D:\Nexus\pruebas\datos\config.json
D:\Nexus\pruebas\nexus.exe -datos D:\Nexus\pruebas\datos

rem Cargar datos ficticios (contraseña de prueba: prueba123) en una base VACÍA:
set NEXUS_URL=http://localhost:8790
python dev\seed.py
```

Para que Allan use la versión nueva: cerrar NEXUS y copiar el `.exe` compilado
a `D:\Nexus\nexus.exe` (o hacer push y que él corra `actualizar.bat`).

## Flujo de publicación

1. Commit en español y `git push origin ccr-04ee6d84-hyehhm`.
2. El workflow `.github/workflows/nexus.yml` compila `nexus.exe` (versión
   `1.1.<run>`, vía `-ldflags -X main.version`) y lo sube a la versión de GitHub
   `nexus-latest` junto con `LEEME.md`, `actualizar.bat` y `version.txt`.
3. Allan da doble clic en `D:\Nexus\actualizar.bat`.

## Estado actual (v1.1)

Hecho: red (vistas Red/Árbol/Órbita, filtros por tipo, cumpleaños próximos),
expedientes con pestañas por sección, mapa de conexiones navegable, edición,
etiquetas, línea de tiempo, archivos con galería y foto de perfil, búsqueda
global (Ctrl+K, incluye notas), editor de tipos y campos, acceso desde el
celular con QR, cambio de contraseña, respaldo cifrado + restaurar arrastrando
el `.nexus` sobre el `.exe`, respaldo automático diario, importador de Google
Contactos / iPhone / Outlook con detección de duplicados, actualizador.

Ideas pendientes que se platicaron o que convienen:
- Opción de emergencia para restablecer la contraseña desde la PC (sin perder datos).
- Exportar a Excel/CSV.
- Recordatorios (cumpleaños, vigencia de seguros, citas médicas).
- Icono propio para `nexus.exe`.
- Mover el proyecto a un repositorio privado (habría que cambiar cómo descarga `actualizar.bat`).
- La base no está cifrada en disco; se recomienda BitLocker/VeraCrypt.
