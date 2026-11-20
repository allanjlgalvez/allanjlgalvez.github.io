# allanjlgalvez.github.io

Sitio raíz de GitHub Pages. Sirve para dos cosas:

1. **`/.well-known/assetlinks.json`**: Digital Asset Links. Android lo usa para confirmar que la app **Guía Mítica Plus** de Google Play es dueña de este sitio y abrirla en pantalla completa, sin barra de navegador. Debe estar en la raíz del dominio, por eso vive en este repo y no en el de la app.
2. **`index.html`**: redirige a la app en <https://allanjlgalvez.github.io/Mythic-Plus-Tips/>.

`.nojekyll` evita que GitHub Pages ignore la carpeta `.well-known` (Jekyll oculta las carpetas que empiezan con punto).

## Actualizar `assetlinks.json`

El archivo lista las huellas SHA-256 de las llaves que firman la app:

- La llave de subida que genera PWABuilder (viene en su `assetlinks.json`).
- La llave de firma de Google Play: Play Console → la app → *Configuración → Integridad de la app → Firma de apps* → "Huella digital del certificado SHA-256".

Las dos huellas deben estar en `sha256_cert_fingerprints`. Las huellas son públicas; **la llave privada (`signing.keystore`) nunca se sube aquí**.

App que publica: <https://github.com/allanjlgalvez/Mythic-Plus-Tips>
