# NEXUS · base de datos personal de contactos

NEXUS es una base de datos privada para guardar todo lo que sabes de tu familia
y amigos: datos generales, contacto, datos médicos, gustos, vehículos, mascotas,
fotos, documentos, notas y cómo se relacionan entre sí. Las relaciones se ven
como un diagrama interactivo.

- **100 % local:** nada sale de tu computadora. No usa internet ni servicios en la nube.
- **Portable:** es un solo programa (`nexus.exe`) más una carpeta `datos`. Para
  cambiar de computadora, copias la carpeta completa.
- **Desde el celular:** se puede consultar desde cualquier dispositivo conectado
  a tu Wi-Fi de casa.
- **Ampliable:** puedes agregar campos y tipos de registro nuevos desde la
  propia app, sin programar.

---

## 1. Instalar en `D:\Nexus` (Windows)

1. Crea la carpeta `D:\Nexus`.
2. Pon ahí el archivo **`actualizar.bat`** y dale doble clic. Descarga la última
   versión de `nexus.exe` y abre NEXUS.
   - Windows SmartScreen puede advertir que es una app desconocida, porque no
     está firmada. Elige **Más información → Ejecutar de todas formas**.
   - El Firewall de Windows preguntará si permites el acceso a la red. Marca
     **Redes privadas** y acepta; eso permite entrar desde el celular.
3. Se abre una ventana negra (el servidor) y tu navegador en
   `http://localhost:8787`. **Deja esa ventana abierta** mientras usas NEXUS y
   ciérrala para apagarlo.
4. Crea tu contraseña. **Guárdala bien: no hay forma de recuperarla.**

Desde entonces, para abrir NEXUS solo das doble clic en `D:\Nexus\nexus.exe`.
Te conviene crear un acceso directo en el escritorio: clic derecho sobre
`nexus.exe` → **Mostrar más opciones → Enviar a → Escritorio**.

```
D:\Nexus\
├── nexus.exe            ← el programa
├── actualizar.bat       ← doble clic para actualizar
├── nexus.anterior.exe   ← versión previa (por si algo falla)
└── datos\               ← TU información (base de datos, fotos, respaldos)
```

### Actualizar a una versión nueva

Cuando haya cambios, solo **doble clic en `actualizar.bat`**. El archivo cierra
NEXUS, descarga la versión nueva, la reemplaza y lo vuelve a abrir. Tus datos no
se tocan. Si la versión nueva diera problemas, borra `nexus.exe` y renombra
`nexus.anterior.exe` a `nexus.exe`.

La versión instalada aparece en **Sistema → Información**.

## 2. Usar NEXUS desde el celular

1. La PC y el celular deben estar en la **misma red Wi-Fi**.
2. En la PC ve a **Sistema → Acceso desde el celular** y escanea el código QR
   con la cámara del celular, o escribe la dirección que aparece (por ejemplo
   `http://192.168.1.50:8787`).
3. Entra con tu contraseña.
4. Tip: en el navegador del celular usa **Agregar a pantalla de inicio** para
   tenerlo como una app.

Si el celular no conecta, revisa que en Windows tu red esté marcada como
**Privada** (Configuración → Red e Internet → Propiedades de tu Wi-Fi) y que el
Firewall permita `nexus.exe` en redes privadas.

> La PC tiene que estar encendida y con NEXUS abierto. Si en algún momento
> quieres un acceso 24/7, NEXUS también corre en una Raspberry Pi o NAS de casa
> (versión Linux, ver sección 9).

## 3. Cómo se usa

| Pantalla | Para qué sirve |
|---|---|
| **Red** | Diagrama de todas tus personas, vehículos y mascotas con sus conexiones. Toca un nodo para ver su ficha rápida y doble clic para abrir su expediente. Abajo eliges la vista: **Red**, **Árbol** (tipo diagrama de flujo) u **Órbita**. Arriba a la izquierda puedes ocultar o mostrar cada tipo. |
| **Registros** | Tarjetas filtrables por tipo y por etiqueta. |
| **Expediente** | Ficha completa de una persona o cosa: foto, mapa de conexiones (toca un nodo para saltar a esa ficha), pestañas por sección (General, Contacto, Médico, Gustos…), línea de tiempo y archivos. |
| **Buscar** (`Ctrl + K`) | Busca en nombres, etiquetas, cualquier dato (placas, teléfono, alergias…) y dentro de las notas. |
| **Sistema** | Tipos de registro y campos, acceso desde el celular, respaldo, contraseña. |

- **Conexiones:** en un expediente usa **Conectar**, elige a la persona o cosa y
  escribe la relación ("es madre de", "maneja", "es dueño(a) de"…). Si la
  persona aún no existe, la puedes crear desde ahí mismo.
- **Archivos:** arrastra fotos, PDF, INE, tarjeta de circulación, recetas o
  estudios médicos a la pestaña **Archivos**. Cualquier foto se puede usar como
  foto de perfil.
- **Cumpleaños:** la pantalla **Red** muestra los cumpleaños de los próximos 45
  días, tomados del campo *Fecha de nacimiento*.

## 4. Importar tus contactos de Google

1. En la PC abre **contacts.google.com** → menú izquierdo → **Exportar**.
2. Elige **Contactos** (todos) y el formato **vCard (para Contactos de iOS)** →
   **Exportar**. Se descarga `contacts.vcf`.
3. En NEXUS ve a **Registros → Importar contactos** (también está en
   **Sistema**) y arrastra el archivo.
4. Revisa la vista previa y presiona **Importar**:
   - Se traen nombre, apodo, teléfonos, correos, dirección, empresa, puesto,
     cumpleaños, notas, etiquetas de Google y fotos.
   - Los contactos que ya existen (por nombre, teléfono o correo) se
     **completan**: solo se llenan los datos vacíos, nunca se borra nada. También
     puedes omitirlos o duplicarlos.
   - Los teléfonos y correos de más se guardan como nota en la línea de tiempo.
   - Las fotos de Google se descargan de internet; si no hay conexión, el
     contacto se importa sin foto.

También acepta el CSV de Google, el CSV de Outlook y los vCard exportados de
iPhone/iCloud. Puedes importar las veces que quieras: los duplicados se detectan.

## 5. Agregar campos o tipos nuevos

Ve a **Sistema → Tipos de registro y campos**:

- Abre un tipo (Persona, Vehículo, Mascota) y usa **+ Campo**. Hay campos de
  texto corto, texto largo, número, fecha, lista de opciones, teléfono, correo,
  enlace y Sí/No. También puedes crear secciones nuevas y reordenarlas.
- Con **Nuevo tipo** creas categorías nuevas, por ejemplo *Lugar*, *Empresa* o
  *Médico*, con su propio color, icono y forma en el diagrama.
- Si quitas un campo, **no se pierde** lo que ya capturaste: aparece en la
  pestaña *Otros datos* del expediente.

## 6. Respaldos

- **Automático:** cada vez que abres NEXUS se guarda una copia diaria de la base
  de datos en `datos\respaldos\auto` (se conservan las 10 más recientes). Esta
  copia **no incluye** fotos ni documentos.
- **Completo y cifrado:** en **Sistema → Respaldo** eliges una contraseña y se
  descarga un archivo `.nexus` con todo (datos, fotos y documentos), cifrado con
  AES-256. Guárdalo en una USB o en otro lugar seguro.
- **Regla 3-2-1 recomendada:** 3 copias, en 2 medios distintos, 1 fuera de casa.

### Restaurar un respaldo

1. Cierra NEXUS (la ventana negra).
2. **Arrastra el archivo `.nexus` sobre `nexus.exe`.**
3. Escribe la contraseña del respaldo.
4. Tus datos actuales no se borran: se renombran a `datos-anterior-FECHA`.

## 7. Cambiar de computadora

Copia la carpeta completa `D:\Nexus` (con `datos` adentro) a la nueva
computadora y abre `nexus.exe`. Nada más.

## 8. Seguridad

- Todo se queda en `datos\`: la base `nexus.db`, `archivos\` y `respaldos\`.
- NEXUS pide contraseña en todos los dispositivos. Las sesiones duran 30 días;
  al cambiar la contraseña se cierran todas.
- La base de datos **no está cifrada en el disco**. Para protegerla si te roban
  la PC o la USB, guarda la carpeta de NEXUS dentro de una unidad cifrada con
  **BitLocker** (Windows Pro) o **VeraCrypt** (gratis). Es lo más recomendable,
  sobre todo por los datos médicos.
- El acceso desde el celular viaja sin cifrar dentro de tu red de casa. Úsalo
  solo en tu Wi-Fi de confianza, nunca en redes públicas. Para desactivarlo
  cambia `"red_local": false` en `datos\config.json`.
- **Nunca subas la carpeta `datos` a GitHub ni a ningún servicio público.**

### `datos\config.json`

```json
{
  "puerto": 8787,
  "red_local": true,
  "abrir_navegador": true
}
```

## 9. Para desarrolladores

Código fuente: Go (servidor + SQLite sin dependencias de C) e interfaz en
JavaScript sin frameworks (`web/`). La interfaz va incrustada dentro del
ejecutable.

```bash
# requisitos: Go 1.22+
./build.sh                                            # genera dist/NEXUS-windows.zip
go build -o nexus .                                   # Linux / Mac / Raspberry Pi
./nexus -datos ./datos                                # usar otra carpeta de datos
./nexus -restaurar respaldo.nexus                     # restaurar desde consola
GOOS=linux GOARCH=arm64 go build -o nexus-pi .        # Raspberry Pi 64 bits
```

| Archivo | Contenido |
|---|---|
| `main.go` | Arranque, configuración, red local |
| `db.go` | Esquema SQLite, migraciones, tipos y campos iniciales |
| `api.go` | API REST (registros, conexiones, línea de tiempo, archivos) |
| `auth.go` | Contraseña (bcrypt), sesiones, límite de intentos |
| `importer.go` | Descarga de fotos de contactos importados |
| `backup.go` | Respaldos cifrados (scrypt + AES-256-GCM) y restauración |
| `web/` | Interfaz: `index.html`, `app.css`, `app.js`, `import.js` (importador), Cytoscape.js y fuentes |
| `actualizar.bat` | Instalador / actualizador para Windows |
| `../.github/workflows/nexus.yml` | Compila y publica `nexus.exe` en GitHub con cada cambio |

Licencias de terceros: Cytoscape.js (MIT), fuentes Rajdhani y Orbitron (SIL OFL).
