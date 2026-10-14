/* =========================================================
   Pollos Sabroson — config.js   (EL ARCHIVO PARA PERSONALIZAR)
   ---------------------------------------------------------
   Aquí cambias textos, colores, imagen de portada, teléfono,
   dirección y mapa. Guardas el archivo, recargas la página
   (Ctrl + F5) y se ve el cambio. No necesitas tocar Supabase.

   REGLA ÚNICA (fácil de recordar):
     • Si escribes un valor aquí  -> ESE valor se usa siempre.
     • Si lo dejas vacío ("")     -> manda lo que esté guardado
                                     en el panel admin / Supabase.

   Los colores van en formato hexadecimal, ej: "#e65636".
   Lo que NO está aquí (títulos de secciones, textos de la
   página, etc.) se cambia directamente en index.html.
   Los colores base también viven en css/style.css (:root).
   ========================================================= */
window.CONFIG_MANUAL = {

  /* ---------- MARCA ---------- */
  NOMBRE: "Pollos Sabroson",            // logo, pestaña del navegador y pie de página
  ESLOGAN: "El sabor que|une a la familia.", // título grande de la portada. "|" = salto de línea (la 2ª línea sale en cursiva)

  /* ---------- COLORES ---------- */
  COLOR_PRIMARIO:   "#e65636",  // botones y acentos (el "tomate")
  COLOR_SECUNDARIO: "#e9ab35",  // etiquetas y detalles (el dorado)
  COLOR_OSCURO:     "#28241f",  // textos, franjas oscuras y footer
  COLOR_FONDO:      "#fffdfa",  // fondo general del sitio

  /* ---------- IMAGEN DE PORTADA ---------- */
  IMAGEN_PORTADA: "",  // ej: "./assets/hero-pollos-sabroson.jpg". Vacío = la de index.html / panel

  /* ---------- CONTACTO ---------- */
  TELEFONO: "",        // ej: "700 00000". Vacío = el del panel admin
  TEXTO_DELIVERY: "",  // ej: "Coordinamos la entrega en tu dirección". Vacío = el del panel
  DIRECCION: "Frente a la parada de Warnes, Warnes - Santa Cruz",
  // Dirección: lo que va antes de la 1ª coma sale grande, lo demás sale chico.

  /* ---------- MAPA (Google Maps > Compartir > Insertar un mapa) ---------- */
  // Pega solo la dirección que está dentro de src="..." del iframe.
  MAPA_URL:
    "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d243396.68934889307!2d-63.29470904518994!3d-17.599255200209548!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x93f1e1dfe80b7e85%3A0x6798db8819253304!2s%22POLLOS%20SABROSON%22!5e0!3m2!1ses!2sbo!4v1790178563010!5m2!1ses!2sbo"
};
