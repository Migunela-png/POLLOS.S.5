# POLLITOSUPABASE — vanilla2

Sitio de **Pollos Sabroson** escrito en HTML, CSS y JavaScript reales: sin React,
sin Tailwind, sin build y sin paso de compilación. Cualquier archivo `.html`,
`.css` o `.js` se puede abrir y editar directamente.

Esta versión toma el diseño y las funciones de `POLLITOSUPABASE_ESTRUCTURA3`
(que en realidad era una aplicación React compilada) y las reescribe sobre la
base limpia de la versión vanilla.

---

## Estructura

```
POLLITOSUPABASE_vanilla2/
├── index.html            Tienda completa + panel de administración
├── admin.html            Gestor de catálogo independiente
├── css/
│   └── style.css         Todo el sistema de diseño (paleta, layout, componentes)
├── js/
│   ├── icons.js          Iconos SVG en línea (estilo Lucide)
│   ├── supabaseClient.js Configuración pública del cliente Supabase
│   ├── data.js           Catálogo de respaldo, opciones fijas y utilidades
│   ├── app.js            Tienda: menú, carrito, checkout, cuenta
│   ├── adminPanel.js     Panel de administración dentro de index.html
│   └── adminCrud.js      CRUD de productos de admin.html
├── assets/
│   ├── hero-pollos-sabroson.jpg   Portada principal
│   ├── food/             Imagen por categoría
│   └── products/         Una imagen por producto
└── sql/                  Esquema y migraciones de Supabase
```

### Qué hace cada archivo JavaScript

| Archivo | Responsabilidad |
|---|---|
| `icons.js` | Define 23 iconos SVG y la función `icon(nombre, tamaño)`. También rellena los `<span data-icon="...">` del HTML. |
| `supabaseClient.js` | Crea `window.sb`, el cliente compartido por todo el sitio. |
| `data.js` | Catálogo de respaldo (11 productos), presas, acompañantes, categorías y utilidades de formato (`formatPrice`, `normalizeCategory`, `mapProduct`). |
| `app.js` | Encabezado, buscador, filtros, tarjetas de producto, modal de producto, carrito, formulario de pedido, cuenta de cliente y acceso al panel. |
| `adminPanel.js` | Panel con Resumen, Productos, Pedidos, Clientes y Ajustes. Incluye crear, editar, ocultar y eliminar productos. |
| `adminCrud.js` | Misma gestión de catálogo, pero como página aparte (`admin.html`). |

---

## Cómo probarlo

El sitio necesita un servidor estático (no basta con abrir el archivo con doble clic,
porque el navegador bloquea las peticiones desde `file://`).

- **Visual Studio Code:** abre la carpeta e instala la extensión *Live Server*.
  Luego haz clic derecho sobre `index.html` → *Open with Live Server*.
- **Con Python:** `python3 -m http.server` dentro de la carpeta, y abre
  `http://localhost:8000`.

Si Supabase no responde, el menú se muestra igual con el catálogo de respaldo
de `js/data.js`, así que el sitio nunca se ve vacío.

---

## Configurar Supabase

1. Copia todo `sql/schema.sql` en **Supabase → SQL Editor → New query → Run**.
   *(Solo para instalar desde cero: `schema.sql` borra los productos que no estén en su lista de productos base (11 de comida y 3 bebidas). No lo vuelvas a ejecutar en un negocio que ya tiene productos propios; para eso están las migraciones.)*
2. Ejecuta después `sql/migracion_rls.sql`, `sql/migracion_storage.sql` y
   **`sql/migracion_pedidos_seguros.sql`** (obligatoria: los pedidos se crean con la
   función `crear_pedido()`, ya no con un insert directo).
   Después ejecuta **`sql/migracion_fase2.sql`** (pausar tienda, horarios y avisos de
   pedidos nuevos en tiempo real).
   Para la contabilidad ejecuta **`sql/migracion_contabilidad.sql`** (crea la tabla `movimientos_contables`; solo el administrador puede verla).
   Por último ejecuta **`sql/migracion_fase3.sql`** (bebidas, seguimiento del pedido y
   tiempo estimado).
3. Antes de registrar el primer usuario, ejecuta `sql/REPARAR_SIGNUP.sql`.
4. Revisa `js/supabaseClient.js`: debe tener la URL y la *publishable key*
   (o *anon key*) de tu proyecto. Esa clave pública sí puede ir en el frontend;
   **nunca** uses una `service_role` key.
5. En **Authentication** crea el usuario administrador y asígnale el rol con:

   ```sql
   update public.perfiles set rol = 'administrador' where id = 'UUID_DEL_USUARIO';
   ```

### Migraciones opcionales

| Archivo | Para qué sirve |
|---|---|
| `migracion_stock.sql` | Agrega la columna de stock al catálogo existente. |
| `migracion_pedidos_seguros.sql` | Pedidos seguros: precio y total calculados en el servidor, descuento de stock (y devolución al cancelar), código de pedido único, anti-duplicados y límite de 5 pedidos por teléfono por hora. Se puede ejecutar varias veces sin borrar pedidos. |
| `migracion_fase2.sql` | Requiere `migracion_pedidos_seguros.sql`. Agrega **pausar tienda**, **horarios de atención** (con cierre automático, también si pasan de medianoche) y activa **Realtime** en `pedidos` para los avisos del panel. Los pedidos se rechazan en la base de datos si la tienda está cerrada. Se puede ejecutar varias veces. |
| `migracion_fase3.sql` | Requiere `migracion_fase2.sql`. Agrega la categoría **Bebidas** (con 3 bebidas de ejemplo: **sus precios son de referencia, ajústalos en Admin > Productos** o bórralas), la función `ver_pedido()` para que el cliente siga su pedido con su código + su teléfono (sin cuenta) y el **tiempo estimado de entrega**. Se puede ejecutar varias veces. |
| `migracion_imagenes.sql` | Asigna una imagen por categoría. |
| `migracion_imagenes_productos.sql` | Asigna una imagen distinta a cada producto. |
| `migracion_hero.sql` | Habilita la portada editable desde el panel. |
| `migracion_ajustes_negocio.sql` | Necesaria para que el botón "Guardar cambios" de Admin > Ajustes funcione (nombre, teléfono, texto de delivery, dirección). |

---

## Acceso al panel de administración

Hay dos caminos, y los dos piden una cuenta con rol `administrador`:

- **Dentro del sitio:** botón **Administrador** del encabezado. El panel reemplaza
  la tienda y se vuelve con *Ver tienda*.
- **Página aparte:** `admin.html`, pensada para la gestión de catálogo más detallada
  (clave interna de tamaño, stock, disponibilidad).

---

## Tablas que usa

`productos`, `pedidos`, `perfiles` y `configuracion`, más los buckets de Storage
`pagos` (imagen QR) y `productos` (fotos del catálogo). Las políticas RLS incluidas
permiten leer el catálogo público y reservar la gestión para administradores.
Los pedidos sin cuenta se crean únicamente con `crear_pedido()`, que valida datos,
precios y stock en el servidor.

---

## Notas sobre esta versión

- El SDK de Supabase está incluido **localmente** en `js/supabase.js` (no se descarga
  de ningún CDN externo). Esto evita que un bloqueador de anuncios, un firewall
  corporativo o la "Prevención de seguimiento" de navegadores como Edge impidan
  que el sitio funcione. Si en el futuro quieres actualizar la versión del SDK,
  descarga el archivo `dist/umd/supabase.js` del paquete `@supabase/supabase-js`
  de npm y reemplaza `js/supabase.js`.
- Las rutas de imágenes son **relativas** (`./assets/...`), así que el sitio funciona
  también dentro de un subdirectorio, por ejemplo en GitHub Pages.
- El carrito se guarda en `localStorage`, así que sobrevive a una recarga.
- **Resumen del panel con datos reales:** ventas, pedidos, clientes y consumo promedio
  de los últimos 7 días, comparados con los 7 días anteriores (los pedidos cancelados no
  cuentan). La gráfica semanal y la dona por categoría también se calculan con los
  pedidos reales.
- **Aviso de pedido nuevo:** al entrar un pedido el panel muestra un aviso, suena un
  "ding-dong" (se puede silenciar con la campana), marca la pestaña del navegador con
  `(1) Pedido nuevo` y, si das permiso, envía una notificación del sistema. Usa
  Realtime y, como respaldo, revisa cada 20 segundos. El navegador solo deja sonar
  audio después de que hagas un clic en la página: abre el panel y haz clic una vez.
- **Ticket imprimible:** en Pedidos, el botón de la impresora arma un ticket para
  cocina (ancho de impresora térmica de 80 mm) y abre el diálogo de impresión.
- **Pausar tienda / horarios:** Admin > Ajustes > *Estado de la tienda* y el botón de
  la parte superior del panel. Los clientes ven un aviso y no pueden confirmar pedidos.
  La hora de la tienda es la de Bolivia (`America/La_Paz`).
- **Venta cruzada de bebidas:** en la bolsa aparece "¿Le agregas una bebida?" con hasta 3
  bebidas disponibles (solo si el pedido no tiene ya una). Si no hay bebidas cargadas, el
  bloque y el filtro "Bebidas" no se muestran. Se administran en Admin > Productos,
  categoría *Bebida*; cambia el ícono genérico `assets/products/bebida.svg` subiendo tus propias fotos.
- **Confirmación y seguimiento del pedido:** al confirmar, el cliente ve su código, el total,
  la línea de tiempo (recibido → preparando → en camino / listo para recoger → entregado), el
  tiempo estimado y un botón para compartir por WhatsApp. El estado se actualiza solo cada 15
  segundos. Si el pago es por QR y aún no se confirma, muestra el QR y el botón de comprobante
  con el código. Mientras el pedido siga en curso, queda un botón flotante **Mi pedido** que
  vuelve a abrir el seguimiento (también después de recargar la página).
- **Tiempo estimado:** Admin > Ajustes > *Estado de la tienda* (por ejemplo "30 a 40 min").
- **Imágenes livianas:** el paquete de imágenes pasó de 7,2 MB a 1,5 MB (la portada de 4,6 MB
  a ~200 KB) con los mismos nombres de archivo, así que las rutas guardadas en Supabase no cambian.
- **Vista previa al compartir el enlace:** `index.html` incluye etiquetas Open Graph / Twitter y
  `assets/og-image.jpg` (1200 × 630). **WhatsApp y Facebook no leen rutas relativas:** cuando tengas tu
  dominio, cambia `og:image` y `twitter:image` en `index.html` por la dirección completa
  (por ejemplo `https://tudominio.com/assets/og-image.jpg`).
- **Buscador:** funciona sin importar tildes ni mayúsculas, acepta varias palabras
  ("broaster entero") y hay un campo también dentro del menú. En celular la lupa del
  encabezado lleva a ese campo.
- **Nombre de usuario en la esquina:** con sesión iniciada aparece tu primer nombre
  (o **Admin** si eres administrador), con un menú para ver tu correo, abrir el panel
  y cerrar sesión.
