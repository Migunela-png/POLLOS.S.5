/* =========================================================
   Pollos Sabroson — app.js

   Tienda: menú, filtros, buscador, carrito, checkout,
   cuenta de cliente y acceso al panel de administración.
   JavaScript puro, sin framework ni build.
   ========================================================= */
(function () {
  "use strict";

  var sb = window.sb;
  var D = window.PS_DATA;
  var icon = window.icon;

  /** Número de WhatsApp del negocio para enviar comprobantes de pago QR. */
  var WHATSAPP_QR = "59176388636";

  /* ---------------------------------------------------------
     Estado
     --------------------------------------------------------- */
  var state = {
    productos: D.FALLBACK.slice(),
    filtro: "Todos",
    busqueda: "",
    cargando: true,
    cart: leerCarrito(),
    sesion: { user: null, rol: "cliente" },
    qrUrl: "",
    navAbierta: false,
    envio: null, // { firma, clave } del intento de pedido en curso (anti-duplicados)
    tienda: { abierta: true, mensaje: "", motivo: "" } // abierta / pausada / fuera de horario
  };

  /* ---------------------------------------------------------
     Utilidades
     --------------------------------------------------------- */
  var $ = function (sel, ctx) {
    return (ctx || document).querySelector(sel);
  };
  var $$ = function (sel, ctx) {
    return Array.prototype.slice.call((ctx || document).querySelectorAll(sel));
  };

  /** Escapa texto antes de insertarlo en HTML. */
  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function leerCarrito() {
    try {
      var raw = localStorage.getItem("ps_cart");
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function guardarCarrito() {
    try {
      localStorage.setItem("ps_cart", JSON.stringify(state.cart));
    } catch (e) {
      /* almacenamiento no disponible: el carrito solo vive en memoria */
    }
  }

  var toastTimer = null;
  function toast(mensaje) {
    var root = $("#toastRoot");
    root.innerHTML = '<div class="toast">' + icon("check", 16) + "<span>" + esc(mensaje) + "</span></div>";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      root.innerHTML = "";
    }, 2600);
  }

  /* ---------------------------------------------------------
     Capa de ventanas (modales y drawer)
     --------------------------------------------------------- */
  var layer = {
    abrir: function (html, alCerrar) {
      var root = $("#layerRoot");
      root.innerHTML = html;
      window.hydrateIcons(root);
      document.body.style.overflow = "hidden";
      layer._alCerrar = alCerrar || null;

      // Cerrar al hacer clic fuera del contenido
      var backdrop = root.firstElementChild;
      if (backdrop) {
        backdrop.addEventListener("mousedown", function (e) {
          if (e.target === backdrop) layer.cerrar();
        });
        var caja = backdrop.firstElementChild;
        if (caja) {
          caja.addEventListener("mousedown", function (e) {
            e.stopPropagation();
          });
        }
      }
      $$("[data-cerrar]", root).forEach(function (b) {
        b.addEventListener("click", layer.cerrar);
      });
      return root;
    },
    cerrar: function () {
      $("#layerRoot").innerHTML = "";
      document.body.style.overflow = "";
      qrFullscreen.cerrar();
      if (layer._alCerrar) {
        var fn = layer._alCerrar;
        layer._alCerrar = null;
        fn();
      }
    }
  };

  /* ---------------------------------------------------------
     Vista del QR de pago a pantalla casi completa
     --------------------------------------------------------- */
  var qrFullscreen = {
    _overlay: null,
    abrir: function (url) {
      if (!url) return;
      this.cerrar();
      var overlay = document.createElement("div");
      overlay.className = "qr-fullscreen-overlay";
      overlay.innerHTML =
        '<button type="button" class="qr-fullscreen-close" aria-label="Cerrar">' + icon("x", 22) + "</button>" +
        '<div class="qr-fullscreen-box">' +
        '<img src="' + esc(url) + '" alt="Código QR de pago" />' +
        "<p>Escanea este código con tu app bancaria o de billetera móvil.</p>" +
        "</div>";
      document.body.appendChild(overlay);

      var self = this;
      overlay.addEventListener("mousedown", function (e) {
        if (e.target === overlay) self.cerrar();
      });
      overlay.querySelector(".qr-fullscreen-close").addEventListener("click", function () {
        self.cerrar();
      });
      this._overlay = overlay;
      requestAnimationFrame(function () {
        overlay.classList.add("visible");
      });
    },
    cerrar: function () {
      if (this._overlay) {
        this._overlay.remove();
        this._overlay = null;
      }
    }
  };

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (qrFullscreen._overlay) {
      qrFullscreen.cerrar();
      return;
    }
    layer.cerrar();
  });

  /* ---------------------------------------------------------
     Encabezado de sección reutilizable
     --------------------------------------------------------- */
  function sectionHeading(eyebrow, title, detail, dark) {
    return (
      '<div class="section-heading' + (dark ? " section-heading-dark" : "") + '">' +
      '<p class="eyebrow"><span></span>' + esc(eyebrow) + "</p>" +
      "<h2>" + title + "</h2>" +
      (detail ? '<p class="section-detail">' + esc(detail) + "</p>" : "") +
      "</div>"
    );
  }

  /* ---------------------------------------------------------
     Red de seguridad para imágenes rotas: si una foto no carga,
     se intenta la foto local del producto (por nombre) y, si
     tampoco existe, la imagen de portada. Nunca queda vacía.
     --------------------------------------------------------- */
  document.addEventListener(
    "error",
    function (e) {
      var img = e.target;
      if (!img || img.tagName !== "IMG" || img.id === "heroImg") return;
      var paso = Number(img.getAttribute("data-fb") || 0);
      if (paso >= 2) return;
      img.setAttribute("data-fb", String(paso + 1));
      var local = paso === 0 ? D.fotoPorNombre(img.alt) : null;
      img.src = local || D.IMG.hero;
    },
    true
  );

  /* ---------------------------------------------------------
     Categorías
     --------------------------------------------------------- */
  function renderCategorias() {
    $("#categoryGrid").innerHTML = D.CATEGORIAS.map(function (c) {
      return (
        '<button class="category-card ' + c.tone + '" data-filtro="' + esc(c.filtro) + '" aria-label="' + esc(c.name) + '">' +
        '<span class="category-photo"><img src="' + esc(c.image) + '" alt="' + esc(c.name) + '" loading="lazy" /></span>' +
        '<span class="category-card-copy">' +
        "<span>" + esc(c.count) + "</span>" +
        "<h3>" + esc(c.name) + "</h3>" +
        icon("arrow-right", 20) +
        "</span></button>"
      );
    }).join("");

    $("#categoryGrid").addEventListener("click", function (e) {
      var btn = e.target.closest(".category-card");
      if (!btn) return;
      state.filtro = btn.dataset.filtro;
      renderFiltros();
      renderMenu();
      var destino = document.getElementById("menu");
      if (destino) destino.scrollIntoView({ behavior: "smooth" });
    });
  }

  /* ---------------------------------------------------------
     Filtros del menú
     --------------------------------------------------------- */
  function renderFiltros() {
    var hayBebidas = state.productos.some(function (p) { return p.category === "Bebidas"; });
    $("#filterTabs").innerHTML = D.FILTROS.filter(function (f) {
      return f !== "Bebidas" || hayBebidas;
    }).map(function (f) {
      return '<button class="' + (state.filtro === f ? "active" : "") + '" data-filtro="' + esc(f) + '">' + esc(f) + "</button>";
    }).join("");
  }

  $("#filterTabs").addEventListener("click", function (e) {
    var btn = e.target.closest("button[data-filtro]");
    if (!btn) return;
    state.filtro = btn.dataset.filtro;
    renderFiltros();
    renderMenu();
  });

  /* ---------------------------------------------------------
     Menú de productos
     --------------------------------------------------------- */
  /** Minúsculas y sin tildes: "Económico" == "economico". */
  function normalizar(texto) {
    return String(texto == null ? "" : texto)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function productosVisibles() {
    // Cada palabra escrita debe aparecer en el nombre, descripción, categoría o etiqueta
    var palabras = normalizar(state.busqueda).split(/\s+/).filter(Boolean);
    return state.productos.filter(function (p) {
      var coincideCategoria = state.filtro === "Todos" || p.category === state.filtro;
      if (!coincideCategoria) return false;
      if (!palabras.length) return true;
      var texto = normalizar(
        [p.name, p.description, p.category, p.badge, (p.portions || []).join(" ")].join(" ")
      );
      return palabras.every(function (w) {
        return texto.indexOf(w) !== -1;
      });
    });
  }

  /** Solo el pollo (brasa y broaster) permite elegir presa. Lomito y hamburguesa no. */
  function tienePresas(p) {
    return p.category === "Brasa" || p.category === "Broaster";
  }

  function tarjetaProducto(p) {
    var agotado = p.stock != null && p.stock <= 0;
    return (
      '<article class="product-card" data-id="' + esc(p.id) + '">' +
      '<button class="product-image-wrap" data-abrir="' + esc(p.id) + '" aria-label="Ver ' + esc(p.name) + '">' +
      '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" loading="lazy" />' +
      (p.badge ? '<span class="product-badge ' + esc(p.accent) + '">' + esc(p.badge) + "</span>" : "") +
      '<span class="quick-view">Ver detalle ' + icon("arrow-right", 14) + "</span>" +
      "</button>" +
      '<div class="product-content">' +
      '<div class="product-meta">' +
      "<span>" + esc(p.category) + "</span>" +
      "<span>" + icon("star", 13, { fill: "currentColor" }) + " 4.9</span>" +
      "</div>" +
      "<h3>" + esc(p.name) + "</h3>" +
      "<p>" + esc(p.description) + "</p>" +
      (tienePresas(p)
        ? '<label class="presa-selector">Presa preferida' +
          '<select data-presa="' + esc(p.id) + '" aria-label="Presa preferida para ' + esc(p.name) + '">' +
          D.PRESAS.map(function (o) {
            return '<option value="' + esc(o.value) + '">' + esc(o.label) + "</option>";
          }).join("") +
          "</select></label>"
        : "") +
      '<div class="product-bottom">' +
      "<strong>" + D.formatPrice(p.price) + "</strong>" +
      (agotado
        ? '<span class="menu-count">Agotado</span>'
        : '<button class="add-circle" data-agregar="' + esc(p.id) + '" aria-label="Agregar ' + esc(p.name) + '">' + icon("plus", 18) + "</button>") +
      "</div></div></article>"
    );
  }

  function renderMenu() {
    var lista = productosVisibles();
    var cont = $("#menuResults");

    var buscado = state.busqueda.trim();
    $("#menuCount").textContent = state.cargando
      ? "Cargando menú..."
      : lista.length + (lista.length === 1 ? " resultado" : " resultados") +
        (buscado ? ' para "' + buscado + '"' : "");

    if (!lista.length) {
      cont.innerHTML =
        '<div class="no-results">' +
        icon("utensils", 28) +
        "<h3>No encontramos ese antojo</h3>" +
        "<p>" + (buscado ? 'No hay resultados para "' + esc(buscado) + '". ' : "") +
        "Prueba con otra palabra o vuelve a ver todo el menú.</p>" +
        '<button class="outline-button" id="btnLimpiar">Limpiar filtros</button>' +
        "</div>";
      $("#btnLimpiar").addEventListener("click", limpiarFiltros);
      return;
    }

    cont.innerHTML = '<div class="product-grid">' + lista.map(tarjetaProducto).join("") + "</div>";
  }

  function limpiarFiltros() {
    state.filtro = "Todos";
    establecerBusqueda("");
    renderFiltros();
    renderMenu();
  }

  // Delegación de eventos del menú
  $("#menuResults").addEventListener("click", function (e) {
    var abrir = e.target.closest("[data-abrir]");
    if (abrir) {
      var p = buscarProducto(abrir.dataset.abrir);
      if (p) abrirModalProducto(p);
      return;
    }
    var agregar = e.target.closest("[data-agregar]");
    if (agregar) {
      var prod = buscarProducto(agregar.dataset.agregar);
      if (!prod) return;
      var select = $('select[data-presa="' + CSS.escape(prod.id) + '"]', $("#menuResults"));
      agregarRapido(prod, select ? select.value : "");
    }
  });

  function buscarProducto(id) {
    return state.productos.filter(function (p) {
      return String(p.id) === String(id);
    })[0];
  }

  /* ---------------------------------------------------------
     Modal de producto
     --------------------------------------------------------- */
  function abrirModalProducto(p) {
    var sel = { portion: p.portions[0], presa: "", addon: p.addons[0] || "", cantidad: 1 };

    function html() {
      return (
        '<div class="modal-backdrop"><div class="product-modal">' +
        '<button class="modal-close" data-cerrar aria-label="Cerrar">' + icon("x", 20) + "</button>" +
        '<div class="modal-image"><img src="' + esc(p.image) + '" alt="' + esc(p.name) + '" /></div>' +
        '<div class="modal-body">' +
        '<div class="product-meta"><span>' + esc(p.category) + "</span>" +
        "<span>" + icon("star", 13, { fill: "currentColor" }) + " 4.9</span></div>" +
        "<h2>" + esc(p.name) + "</h2>" +
        '<p class="modal-description">' + esc(p.description) +
        (p.category === "Bebidas" ? "" : " Preparado al momento, con ingredientes frescos y ese toque sabroso que nos distingue.") + "</p>" +
        (tienePresas(p)
          ? '<div class="option-block"><label>Presa preferida</label><div class="option-row" data-grupo="presa">' +
            D.PRESAS.map(function (o) {
              return '<button class="' + (sel.presa === o.value ? "selected" : "") + '" data-valor="' + esc(o.value) + '">' + esc(o.label) + "</button>";
            }).join("") +
            "</div></div>"
          : "") +
        (p.addons.length
          ? '<div class="option-block"><label>Para acompañar</label><div class="option-row" data-grupo="addon">' +
            p.addons.map(function (a) {
              return '<button class="' + (sel.addon === a ? "selected" : "") + '" data-valor="' + esc(a) + '">' + esc(a) + "</button>";
            }).join("") +
            "</div></div>"
          : "") +
        '<div class="modal-actions">' +
        '<div class="quantity-control">' +
        '<button data-cantidad="-1">' + icon("minus", 15) + "</button>" +
        "<span>" + sel.cantidad + "</span>" +
        '<button data-cantidad="1">' + icon("plus", 15) + "</button>" +
        "</div>" +
        '<button class="primary-button modal-add" data-confirmar>Agregar · ' +
        D.formatPrice(p.price * sel.cantidad) + " " + icon("shopping-bag", 17) + "</button>" +
        "</div></div></div></div>"
      );
    }

    function pintar() {
      var root = layer.abrir(html());
      $$("[data-grupo] button", root).forEach(function (b) {
        b.addEventListener("click", function () {
          var grupo = b.closest("[data-grupo]").dataset.grupo;
          sel[grupo] = b.dataset.valor;
          pintar();
        });
      });
      $$("[data-cantidad]", root).forEach(function (b) {
        b.addEventListener("click", function () {
          sel.cantidad = Math.max(1, sel.cantidad + Number(b.dataset.cantidad));
          pintar();
        });
      });
      $("[data-confirmar]", root).addEventListener("click", function () {
        agregarAlCarrito({
          product: p,
          portion: sel.portion,
          addon: sel.addon,
          presa: sel.presa,
          quantity: sel.cantidad
        });
        layer.cerrar();
      });
    }

    pintar();
  }

  /* ---------------------------------------------------------
     Carrito
     --------------------------------------------------------- */
  function agregarAlCarrito(linea) {
    state.cart.push({
      id: linea.product.id,
      nombre: linea.product.name,
      precio: linea.product.price,
      imagen: linea.product.image,
      portion: linea.portion,
      addon: linea.addon,
      presa: linea.presa,
      quantity: linea.quantity
    });
    guardarCarrito();
    actualizarContador();
    toast(linea.product.name + " se agregó a tu bolsa");
  }

  function agregarRapido(p, presa) {
    agregarAlCarrito({
      product: p,
      portion: p.portions[0],
      addon: p.addons[0] || "",
      presa: presa || "",
      quantity: 1
    });
  }

  function totalCarrito() {
    return state.cart.reduce(function (s, l) {
      return s + l.precio * l.quantity;
    }, 0);
  }

  function unidadesCarrito() {
    return state.cart.reduce(function (s, l) {
      return s + l.quantity;
    }, 0);
  }

  function actualizarContador() {
    var n = unidadesCarrito();
    var badge = $("#cartCount");
    badge.textContent = n;
    badge.hidden = n === 0;
  }

  /* ---------------------------------------------------------
     Drawer del carrito + formulario de pedido
     --------------------------------------------------------- */
  function abrirCarrito() {
    var form = { entrega: "delivery", pago: "efectivo", error: "", enviando: false };

    /** Arma el enlace de WhatsApp con un mensaje predeterminado para el comprobante. */
    function enlaceComprobanteQr() {
      var nombre = (form.nombre || "").trim();
      var total = D.formatPrice(totalCarrito());
      var mensaje =
        "Hola! Realicé un pedido" + (nombre ? " a nombre de " + nombre : "") +
        " por un total de " + total + " y quiero enviarles el comprobante de mi pago por QR.";
      return "https://wa.me/" + WHATSAPP_QR + "?text=" + encodeURIComponent(mensaje);
    }

    function lineasHtml() {
      return state.cart.map(function (l, i) {
        return (
          '<div class="cart-line">' +
          '<img src="' + esc(l.imagen) + '" alt="" />' +
          '<div class="cart-line-copy">' +
          "<strong>" + esc(l.nombre) + "</strong>" +
          "<span>" + [l.presa ? "Presa: " + esc(D.presaLabel(l.presa)) : "", esc(l.portion), esc(l.addon)].filter(Boolean).join(" · ") + "</span>" +
          '<div class="cart-line-bottom">' +
          "<b>" + D.formatPrice(l.precio * l.quantity) + "</b>" +
          '<div class="mini-quantity">' +
          '<button data-qty="' + i + '" data-delta="-1">' + icon("minus", 12) + "</button>" +
          "<span>" + l.quantity + "</span>" +
          '<button data-qty="' + i + '" data-delta="1">' + icon("plus", 12) + "</button>" +
          "</div></div></div>" +
          '<button class="remove-line" data-quitar="' + i + '" aria-label="Eliminar">' + icon("x", 14) + "</button>" +
          "</div>"
        );
      }).join("");
    }

    function vacioHtml() {
      return (
        '<div class="empty-cart">' +
        '<span class="empty-cart-icon">' + icon("shopping-bag", 28) + "</span>" +
        "<h3>Tu bolsa está vacía</h3>" +
        "<p>Agrega algo sabroso para empezar tu pedido.</p>" +
        '<button class="outline-button" data-cerrar>Ver el menú</button>' +
        "</div>"
      );
    }

    /** Hasta 3 bebidas disponibles para sugerir (solo si aún no hay una en la bolsa). */
    function bebidasSugeridas() {
      var hayBebida = state.cart.some(function (l) {
        var p = buscarProducto(l.id);
        return p && p.category === "Bebidas";
      });
      if (hayBebida) return [];
      return state.productos.filter(function (p) {
        return p.category === "Bebidas" && !(p.stock != null && p.stock <= 0);
      }).slice(0, 3);
    }

    function ventaCruzadaHtml() {
      var lista = bebidasSugeridas();
      if (!lista.length) return "";
      return (
        '<div class="cross-sell"><div class="cross-sell-head"><strong>¿Le agregas una bebida?</strong>' +
        "<span>Se suma a tu pedido</span></div>" +
        '<div class="cross-sell-list">' +
        lista.map(function (p) {
          return (
            '<div class="cross-sell-item">' +
            '<img src="' + esc(p.image) + '" alt="" loading="lazy" />' +
            "<div><b>" + esc(p.name) + "</b><small>" + esc(p.portions[0]) + " · " + D.formatPrice(p.price) + "</small></div>" +
            '<button type="button" class="cross-sell-add" data-bebida="' + esc(p.id) + '" aria-label="Agregar ' + esc(p.name) + '">' +
            icon("plus", 14) + " Agregar</button></div>"
          );
        }).join("") +
        "</div></div>"
      );
    }

    function formularioHtml() {
      return (
        '<form class="cart-summary order-form" id="formPedido">' +
        '<div class="cart-subtotal"><span>Subtotal</span><strong>' + D.formatPrice(totalCarrito()) + "</strong></div>" +
        "<p>" + icon("truck", 15) + " Completa tus datos y elige cómo pagar</p>" +
        '<div class="form-grid">' +
        '<label>Nombre<input name="nombre" placeholder="Tu nombre" maxlength="80" /></label>' +
        '<label>Teléfono<input name="telefono" placeholder="70000000" inputmode="numeric" maxlength="15" /></label>' +
        "</div>" +
        '<label class="delivery-select">Entrega<select name="entrega">' +
        '<option value="delivery"' + (form.entrega === "delivery" ? " selected" : "") + ">Delivery</option>" +
        '<option value="recojo"' + (form.entrega === "recojo" ? " selected" : "") + ">Recojo en tienda</option>" +
        "</select></label>" +
        (form.entrega === "delivery"
          ? '<label class="delivery-select">Dirección<input name="direccion" placeholder="Av. Principal 123, zona..." maxlength="160" /></label>'
          : "") +
        '<label class="delivery-select">Notas <span>(opcional)</span><input name="notas" placeholder="Sin cebolla, extra papas..." maxlength="160" /></label>' +
        '<div class="payment-block"><label>Forma de pago</label>' +
        '<div class="payment-options">' +
        '<button type="button" class="payment-option' + (form.pago === "efectivo" ? " selected" : "") + '" data-pago="efectivo">' +
        '<span class="payment-icon">Bs</span><span><strong>Efectivo</strong><small>Pagas al recibir o recoger</small></span>' + icon("check", 15) + "</button>" +
        '<button type="button" class="payment-option' + (form.pago === "qr" ? " selected" : "") + '" data-pago="qr">' +
        '<span class="payment-icon qr-icon">QR</span><span><strong>Pago por QR</strong><small>Escanea el código de la casa</small></span>' + icon("check", 15) + "</button>" +
        "</div>" +
        (form.pago === "qr"
          ? (state.qrUrl
              ? '<div class="qr-checkout">' +
                '<img src="' + esc(state.qrUrl) + '" alt="Código QR de pago" data-ver-qr role="button" tabindex="0" />' +
                "<div><strong>Escanea para pagar</strong><span>Una vez hecho el pago, envíanos tu comprobante por WhatsApp para confirmar tu pedido.</span></div>" +
                '<a class="primary-button whatsapp-button" href="' + esc(enlaceComprobanteQr()) + '" target="_blank" rel="noopener">' +
                icon("phone", 15) + " Enviar comprobante</a>" +
                "</div>"
              : '<div class="qr-checkout qr-checkout-empty"><div><strong>El QR no está disponible por ahora</strong>' +
                "<span>Aún no se cargó la imagen del QR de pago. Elige \"Efectivo\" o contacta al negocio para completar tu pedido.</span></div></div>")
          : "") +
        "</div>" +
        (!state.tienda.abierta
          ? '<p class="form-error store-closed-note" role="alert">' + esc(state.tienda.mensaje || "La tienda está cerrada por ahora.") +
            (/[.!?…]$/.test(String(state.tienda.mensaje || "").trim()) ? " " : ". ") +
            "Puedes dejar tu bolsa lista y confirmar cuando abramos.</p>"
          : "") +
        (form.error ? '<p class="form-error" role="alert">' + esc(form.error) + "</p>" : "") +
        '<button class="primary-button payment-submit" type="submit"' + (form.enviando || !state.tienda.abierta ? " disabled" : "") + ">" +
        (form.enviando ? "Guardando pedido..." : !state.tienda.abierta ? "Tienda cerrada" : "Confirmar pedido") + " " + icon("check", 17) +
        "</button></form>"
      );
    }

    function html() {
      return (
        '<div class="drawer-layer"><aside class="cart-drawer">' +
        '<div class="drawer-header">' +
        '<div><p class="eyebrow"><span></span>Pedido</p><h2>Tu bolsa</h2></div>' +
        '<button class="modal-close static-close" data-cerrar aria-label="Cerrar">' + icon("x", 20) + "</button>" +
        "</div>" +
        (state.cart.length === 0
          ? vacioHtml()
          : '<div class="drawer-scroll"><div class="cart-lines">' + lineasHtml() + "</div>" + ventaCruzadaHtml() + formularioHtml() + "</div>") +
        "</aside></div>"
      );
    }

    function pintar(conservar) {
      var datos = conservar || {};
      form.nombre = datos.nombre || form.nombre || "";
      var root = layer.abrir(html());

      // Restaurar lo que el usuario ya había escrito
      var f = $("#formPedido", root);
      if (f) {
        ["nombre", "telefono", "direccion", "notas"].forEach(function (k) {
          if (f[k] && datos[k] != null) f[k].value = datos[k];
        });
      }

      $$("[data-qty]", root).forEach(function (b) {
        b.addEventListener("click", function () {
          var i = Number(b.dataset.qty);
          state.cart[i].quantity = Math.max(1, state.cart[i].quantity + Number(b.dataset.delta));
          guardarCarrito();
          actualizarContador();
          pintar(recogerDatos(root));
        });
      });

      $$("[data-bebida]", root).forEach(function (b) {
        b.addEventListener("click", function () {
          var p = buscarProducto(b.dataset.bebida);
          if (!p) return;
          agregarRapido(p, "");
          pintar(recogerDatos(root));
        });
      });

      $$("[data-quitar]", root).forEach(function (b) {
        b.addEventListener("click", function () {
          state.cart.splice(Number(b.dataset.quitar), 1);
          guardarCarrito();
          actualizarContador();
          pintar(recogerDatos(root));
        });
      });

      $$("[data-pago]", root).forEach(function (b) {
        b.addEventListener("click", function () {
          form.pago = b.dataset.pago;
          pintar(recogerDatos(root));
          if (b.dataset.pago === "qr" && state.qrUrl) {
            qrFullscreen.abrir(state.qrUrl);
          }
        });
      });

      var imgQr = $("[data-ver-qr]", root);
      if (imgQr) {
        imgQr.addEventListener("click", function () {
          qrFullscreen.abrir(state.qrUrl);
        });
      }

      var selEntrega = f && f.entrega;
      if (selEntrega) {
        selEntrega.addEventListener("change", function () {
          form.entrega = selEntrega.value;
          pintar(recogerDatos(root));
        });
      }

      if (f) f.addEventListener("submit", enviarPedido);
    }

    function recogerDatos(root) {
      var f = $("#formPedido", root);
      if (!f) return {};
      return {
        nombre: f.nombre ? f.nombre.value : "",
        telefono: f.telefono ? f.telefono.value : "",
        direccion: f.direccion ? f.direccion.value : "",
        notas: f.notas ? f.notas.value : ""
      };
    }

    async function enviarPedido(e) {
      e.preventDefault();
      var f = e.target;
      var datos = recogerDatos(document);
      var nombre = datos.nombre.trim();
      var telefono = datos.telefono.replace(/\D/g, "");

      function fallar(msg) {
        form.error = msg;
        pintar(datos);
      }

      if (!state.tienda.abierta) return fallar(state.tienda.mensaje || "La tienda está cerrada por ahora.");
      if (nombre.length < 2) return fallar("Escribe tu nombre para continuar.");
      if (!/^[0-9]{7,15}$/.test(telefono)) return fallar("Escribe un número de teléfono válido.");
      if (form.entrega === "delivery" && datos.direccion.trim().length < 8) {
        return fallar("Escribe una dirección válida para el delivery.");
      }
      if (form.pago === "qr" && !state.qrUrl) {
        return fallar("El pago por QR no está disponible por ahora. Elige \"Efectivo\" para continuar.");
      }

      form.error = "";
      form.enviando = true;
      pintar(datos);

      var resultado = await guardarPedido({
        nombre: nombre,
        telefono: telefono,
        entrega: form.entrega,
        direccion: datos.direccion.trim(),
        notas: datos.notas.trim(),
        pago: form.pago
      });

      form.enviando = false;
      if (!resultado.ok) return fallar(resultado.message);

      layer.cerrar();
      guardarUltimoPedido(resultado.pedido);
      abrirSeguimiento(resultado.pedido, true);
    }

    repintarCarrito = function (d) {
      pintar(d);
    };
    pintar();
    // Refresca el QR / configuración por si se actualizó en el panel de
    // administración (u otra pestaña) después de que se cargó esta página.
    if (sb) {
      cargarConfiguracion().then(function () {
        if (state.cart.length > 0) pintar(recogerDatos(document));
      });
    }
  }

  /** Clave única por intento de envío: si la red falla y el cliente reintenta,
   *  el servidor reconoce el mismo pedido y no lo duplica. */
  function nuevaClaveEnvio() {
    try {
      if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    } catch (e) { /* sigue con el respaldo */ }
    return "k" + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }

  var enviandoPedido = false;
  var repintarCarrito = null; // la asigna abrirCarrito() para refrescar el cajón abierto

  async function guardarPedido(datos) {
    // Candado: evita doble clic / doble Enter mientras se procesa
    if (enviandoPedido) return { ok: false, message: "Tu pedido se está procesando, espera un momento." };
    enviandoPedido = true;

    try {
      // Solo se envía QUÉ y CUÁNTO. El precio y el total los calcula el servidor.
      var items = state.cart.map(function (l) {
        return {
          producto_id: String(l.id),
          cantidad: l.quantity,
          presa: l.presa || "",
          acompanante: l.addon || ""
        };
      });

      var firma = JSON.stringify([items, datos]);
      if (!state.envio || state.envio.firma !== firma) {
        state.envio = { firma: firma, clave: nuevaClaveEnvio() };
      }

      var res = await sb.rpc("crear_pedido", {
        p_nombre: datos.nombre,
        p_telefono: datos.telefono,
        p_tipo_entrega: datos.entrega,
        p_direccion: datos.entrega === "delivery" ? datos.direccion : null,
        p_notas: datos.notas || null,
        p_metodo_pago: datos.pago,
        p_items: items,
        p_clave: state.envio.clave
      });

      if (res.error) {
        console.error("crear_pedido:", res.error);
        return { ok: false, message: mensajeErrorPedido(res.error) };
      }

      var codigo = res.data && res.data.codigo ? res.data.codigo : "";
      var resumen = {
        codigo: codigo,
        telefono: datos.telefono,
        nombre: datos.nombre,
        entrega: datos.entrega,
        pago: datos.pago,
        total: res.data && res.data.total != null ? Number(res.data.total) : totalCarrito(),
        creado: Date.now(),
        items: state.cart.map(function (l) {
          return {
            nombre_producto: l.nombre,
            cantidad: l.quantity,
            tamano_etiqueta: l.portion,
            presa_etiqueta: l.presa ? D.presaLabel(l.presa) : "",
            acompanante: l.addon || ""
          };
        })
      };
      state.envio = null;
      state.cart = [];
      guardarCarrito();
      actualizarContador();
      toast("Pedido " + codigo + " guardado correctamente");
      return { ok: true, code: codigo, pedido: resumen };
    } catch (err) {
      console.error(err);
      return {
        ok: false,
        message: "No pudimos conectar. Revisa tu internet e inténtalo de nuevo; tu pedido no se duplicará."
      };
    } finally {
      enviandoPedido = false;
    }
  }

  /** Traduce los errores del servidor a mensajes claros para el cliente. */
  function mensajeErrorPedido(error) {
    var msg = String((error && error.message) || "");
    var m = msg.match(/^(DATOS|STOCK|PRODUCTO|LIMITE|CERRADO):(.+)$/);

    if (m) {
      // El stock cambió o un producto ya no existe: refrescamos el menú
      if ((m[1] === "STOCK" || m[1] === "PRODUCTO") && sb) {
        state.envio = null;
        cargarProductos();
      }
      if (m[1] === "CERRADO") cargarEstadoTienda();
      return m[2].trim();
    }

    // La función aún no existe en Supabase (falta ejecutar la migración)
    if (error && (error.code === "PGRST202" || error.code === "42883")) {
      console.warn("Falta ejecutar sql/migracion_pedidos_seguros.sql en Supabase.");
      return "El pedido no se pudo procesar en este momento. Por favor contáctanos por WhatsApp.";
    }

    return "No pudimos guardar tu pedido. Inténtalo de nuevo en unos segundos o contáctanos por WhatsApp.";
  }

  /* ---------------------------------------------------------
     Confirmación y seguimiento del pedido
     El cliente consulta con su código + su teléfono (función
     ver_pedido de Supabase). No necesita cuenta.
     --------------------------------------------------------- */
  var CLAVE_ULTIMO = "ps_ultimo_pedido";
  var seguimiento = { timer: null, info: null, datos: null, firma: "", nuevo: false, sinConexion: false };
  var tracker = { timer: null, info: null, datos: null };

  function leerUltimoPedido() {
    try {
      var o = JSON.parse(localStorage.getItem(CLAVE_ULTIMO) || "null");
      if (!o || !o.codigo || !o.telefono) return null;
      if (Date.now() - (o.creado || 0) > 24 * 3600 * 1000) {
        borrarUltimoPedido();
        return null;
      }
      return o;
    } catch (e) {
      return null;
    }
  }

  function guardarUltimoPedido(p) {
    try {
      localStorage.setItem(CLAVE_ULTIMO, JSON.stringify(p));
    } catch (e) { /* sin almacenamiento: el seguimiento sigue mientras la página esté abierta */ }
    tracker.info = p;
    tracker.datos = null;
    iniciarTracker();
  }

  function borrarUltimoPedido() {
    try {
      localStorage.removeItem(CLAVE_ULTIMO);
    } catch (e) { /* nada que borrar */ }
  }

  function estadoFinal(estado) {
    return estado === "entregado" || estado === "cancelado";
  }

  async function consultarPedido(info) {
    if (!sb) return { error: true };
    try {
      var r = await sb.rpc("ver_pedido", { p_codigo: info.codigo, p_telefono: info.telefono });
      if (r.error) return { error: true };
      return { data: r.data };
    } catch (e) {
      return { error: true };
    }
  }

  /** Posición del pedido en la línea de tiempo (0 a 3). */
  function pasoDeEstado(estado) {
    if (estado === "en_preparacion") return 1;
    if (estado === "en_camino") return 2;
    if (estado === "entregado") return 3;
    return 0;
  }

  function textoCorto(estado, entrega) {
    if (estado === "pagado") return "Pago confirmado";
    if (estado === "en_preparacion") return "Preparando";
    if (estado === "en_camino") return entrega === "delivery" ? "En camino" : "Listo para recoger";
    if (estado === "entregado") return "Entregado";
    if (estado === "cancelado") return "Cancelado";
    return "Recibido";
  }

  function titularPedido(estado, entrega, nuevo, nombre) {
    var primero = String(nombre || "").trim().split(/\s+/)[0];
    if (estado === "cancelado") return "Pedido cancelado";
    if (estado === "entregado") return "¡Buen provecho!";
    if (estado === "en_camino") return entrega === "delivery" ? "Tu pedido va en camino" : "Tu pedido está listo para recoger";
    if (estado === "en_preparacion") return "Estamos preparando tu pedido";
    if (estado === "pagado") return "Pago confirmado";
    return nuevo ? "¡Gracias" + (primero ? ", " + esc(primero) : "") + "! Recibimos tu pedido" : "Recibimos tu pedido";
  }

  function abrirSeguimiento(info, nuevo) {
    cerrarSeguimiento();
    seguimiento.info = info;
    seguimiento.datos = null;
    seguimiento.firma = "";
    seguimiento.nuevo = !!nuevo;
    seguimiento.sinConexion = false;
    pintarSeguimiento();

    async function actualizar() {
      var r = await consultarPedido(info);
      if (seguimiento.info !== info) return; // se cerró o se abrió otro pedido
      if (r.error) {
        seguimiento.sinConexion = true;
        if (!seguimiento.datos) pintarSeguimiento();
        return;
      }
      seguimiento.sinConexion = false;
      var antes = seguimiento.datos ? seguimiento.datos.estado : null;
      seguimiento.datos = r.data || { noEncontrado: true };
      // El botón flotante "Mi pedido" aprovecha esta misma consulta
      if (tracker.info && tracker.info.codigo === info.codigo && r.data) {
        tracker.datos = r.data;
        if (estadoFinal(r.data.estado)) {
          borrarUltimoPedido();
          tracker.info = null;
          if (tracker.timer) clearInterval(tracker.timer);
          tracker.timer = null;
        }
      }
      var firma = JSON.stringify([seguimiento.datos.estado, seguimiento.datos.tiempo_estimado, seguimiento.datos.noEncontrado]);
      if (firma !== seguimiento.firma) {
        seguimiento.firma = firma;
        pintarSeguimiento();
        if (antes && seguimiento.datos.estado && antes !== seguimiento.datos.estado) {
          toast("Tu pedido ahora está: " + textoCorto(seguimiento.datos.estado, info.entrega));
        }
      }
      if (!r.data || estadoFinal(r.data.estado)) {
        clearInterval(seguimiento.timer);
        seguimiento.timer = null;
      }
    }

    actualizar();
    seguimiento.timer = setInterval(function () {
      if (!document.hidden) actualizar();
    }, 15000);
  }

  function cerrarSeguimiento() {
    if (seguimiento.timer) clearInterval(seguimiento.timer);
    seguimiento.timer = null;
    seguimiento.info = null;
  }

  function enlaceCompartir(info) {
    var negocio = (window.CONFIG_MANUAL && window.CONFIG_MANUAL.NOMBRE) || "Pollos Sabroson";
    var texto =
      "Hice mi pedido " + info.codigo + " en " + negocio + " por " + D.formatPrice(info.total) +
      ". Pide tú también: " + location.origin + location.pathname;
    return "https://wa.me/?text=" + encodeURIComponent(texto);
  }

  function enlaceComprobante(info) {
    var texto =
      "Hola! Mi pedido es " + info.codigo + " por " + D.formatPrice(info.total) +
      " y te envío el comprobante de mi pago por QR.";
    return "https://wa.me/" + WHATSAPP_QR + "?text=" + encodeURIComponent(texto);
  }

  function pintarSeguimiento() {
    var info = seguimiento.info;
    if (!info) return;
    var datos = seguimiento.datos && !seguimiento.datos.noEncontrado ? seguimiento.datos : null;
    var estado = datos ? datos.estado : "pendiente_pago";
    var entrega = (datos && datos.tipo_entrega) || info.entrega;
    var pago = (datos && datos.metodo_pago) || info.pago;
    var items = datos && Array.isArray(datos.items) ? datos.items : info.items || [];
    var total = datos && datos.total != null ? Number(datos.total) : info.total;
    var tiempo = datos && datos.tiempo_estimado ? String(datos.tiempo_estimado).trim() : "";
    var cancelado = estado === "cancelado";
    var actual = pasoDeEstado(estado);

    var nombres = [
      "Pedido recibido",
      "Preparando tu pedido",
      entrega === "delivery" ? "En camino" : "Listo para recoger",
      "Entregado"
    ];
    var detalles = [
      estado === "pagado" ? "Pago confirmado"
        : pago === "qr" && estado === "pendiente_pago" ? "Falta confirmar tu pago por QR"
        : pago === "qr" ? "Pedido registrado"
        : entrega === "delivery" ? "Pagas en efectivo al recibirlo" : "Pagas en efectivo al recoger",
      "La cocina ya está en eso",
      entrega === "delivery" ? "Va hacia tu dirección" : "Ya puedes pasar por él",
      "¡Que lo disfrutes!"
    ];

    var pasos = nombres.map(function (n, i) {
      var clase = cancelado ? (i === 0 ? "done" : "pending")
        : i < actual ? "done"
        : i === actual ? (estado === "entregado" ? "done" : "current")
        : "pending";
      return (
        '<li class="track-step ' + clase + '">' +
        "<i>" + (clase === "done" ? icon("check", 13) : String(i + 1)) + "</i>" +
        "<div><strong>" + esc(n) + "</strong>" +
        (clase === "pending" ? "" : "<small>" + esc(detalles[i]) + "</small>") + "</div></li>"
      );
    }).join("");

    var lista = items.map(function (i) {
      var extra = [i.tamano_etiqueta, i.presa_etiqueta && i.presa_etiqueta !== "Sin preferencia" ? "Presa: " + i.presa_etiqueta : "", i.acompanante]
        .filter(Boolean).join(" · ");
      return "<li><b>" + esc(i.cantidad) + " ×</b> " + esc(i.nombre_producto) + (extra ? " <small>" + esc(extra) + "</small>" : "") + "</li>";
    }).join("");

    var pagoQr =
      pago === "qr" && estado === "pendiente_pago"
        ? '<div class="track-pay"><div><strong>Falta tu pago</strong>' +
          "<span>Paga con el QR y envíanos el comprobante por WhatsApp. Confirmamos y empezamos a preparar.</span></div>" +
          (state.qrUrl ? '<img src="' + esc(state.qrUrl) + '" alt="Código QR de pago" data-ver-qr role="button" tabindex="0" />' : "") +
          '<a class="primary-button whatsapp-button" href="' + esc(enlaceComprobante(info)) + '" target="_blank" rel="noopener">' +
          icon("phone", 15) + " Enviar comprobante</a></div>"
        : "";

    var html =
      '<div class="modal-backdrop"><div class="track-modal" role="dialog" aria-label="Seguimiento de tu pedido">' +
      '<button class="modal-close" data-cerrar aria-label="Cerrar">' + icon("x", 20) + "</button>" +
      '<p class="eyebrow"><span></span>Tu pedido</p>' +
      "<h2>" + (seguimiento.datos && seguimiento.datos.noEncontrado ? "No encontramos este pedido" : titularPedido(estado, entrega, seguimiento.nuevo, info.nombre)) + "</h2>" +
      '<div class="track-code"><div><span>Tu código</span><strong>' + esc(info.codigo) + "</strong></div><b>" + D.formatPrice(total) + "</b></div>" +
      (tiempo && !estadoFinal(estado) ? '<p class="track-eta">' + icon("clock3", 15) + " Tiempo estimado: <b>" + esc(tiempo) + "</b></p>" : "") +
      (cancelado ? '<p class="form-error" role="alert">Este pedido fue cancelado. Si tienes dudas, escríbenos por WhatsApp con tu código.</p>' : "") +
      '<ol class="track-steps">' + pasos + "</ol>" +
      (lista ? '<ul class="track-items">' + lista + "</ul>" : "") +
      pagoQr +
      (seguimiento.sinConexion ? '<p class="track-offline">Sin conexión: seguimos intentando actualizar el estado.</p>' : "") +
      '<div class="track-actions">' +
      '<a class="outline-button" href="' + esc(enlaceCompartir(info)) + '" target="_blank" rel="noopener">' + icon("phone", 15) + " Compartir por WhatsApp</a>" +
      '<button class="primary-button" data-cerrar>Seguir pidiendo ' + icon("arrow-right", 15) + "</button></div>" +
      '<p class="track-note">El estado se actualiza solo. Guarda tu código por si necesitas llamarnos.</p>' +
      "</div></div>";

    var root = layer.abrir(html, function () {
      cerrarSeguimiento();
      pintarTracker();
    });
    var imgQr = $("[data-ver-qr]", root);
    if (imgQr) imgQr.addEventListener("click", function () { qrFullscreen.abrir(state.qrUrl); });
  }

  /* Botón flotante "Mi pedido" mientras haya un pedido en curso */
  function pintarTracker() {
    var el = $("#orderTracker");
    if (!el) return;
    var info = tracker.info;
    var estado = tracker.datos ? tracker.datos.estado : "pendiente_pago";
    if (!info || estadoFinal(estado)) {
      el.hidden = true;
      return;
    }
    $("#orderTrackerText").textContent = "Mi pedido · " + textoCorto(estado, info.entrega);
    el.hidden = false;
  }

  async function refrescarTracker() {
    var info = tracker.info;
    if (!info) return;
    var r = await consultarPedido(info);
    if (tracker.info !== info || r.error) return; // sin conexión: se mantiene lo último
    if (!r.data || estadoFinal(r.data.estado)) {
      tracker.datos = r.data;
      borrarUltimoPedido();
      tracker.info = null;
      clearInterval(tracker.timer);
      tracker.timer = null;
    } else {
      tracker.datos = r.data;
    }
    pintarTracker();
  }

  function iniciarTracker() {
    if (tracker.timer) clearInterval(tracker.timer);
    pintarTracker();
    refrescarTracker();
    tracker.timer = setInterval(function () {
      if (!document.hidden) refrescarTracker();
    }, 30000);
  }

  $("#orderTracker").addEventListener("click", function () {
    if (tracker.info) abrirSeguimiento(tracker.info, false);
  });

  /* ---------------------------------------------------------
     Cuenta de cliente
     --------------------------------------------------------- */
  function abrirModalCuenta() {
    var modo = "login";
    var error = "";
    var procesando = false;

    function html() {
      return (
        '<div class="modal-backdrop"><div class="auth-modal">' +
        '<button class="modal-close" data-cerrar aria-label="Cerrar">' + icon("x", 20) + "</button>" +
        '<p class="eyebrow"><span></span>Cuenta opcional</p>' +
        "<h2>" + (modo === "login" ? "Iniciar sesión" : "Crear cuenta") + "</h2>" +
        "<p>Guarda tus datos y consulta tus pedidos más fácilmente.</p>" +
        '<form id="formCuenta">' +
        (modo === "register"
          ? '<label>Nombre completo<input name="nombre" required minlength="3" /></label>'
          : "") +
        '<label>Correo electrónico<input name="email" type="email" required autocomplete="email" /></label>' +
        '<label>Contraseña<input name="password" type="password" required minlength="6" autocomplete="' +
        (modo === "login" ? "current-password" : "new-password") + '" /></label>' +
        (error ? '<p class="form-error" role="alert">' + esc(error) + "</p>" : "") +
        '<button class="primary-button" type="submit"' + (procesando ? " disabled" : "") + ">" +
        (procesando ? "Procesando..." : modo === "login" ? "Entrar" : "Registrarme") + " " + icon("arrow-right", 17) +
        "</button></form>" +
        '<button class="auth-switch" data-cambiar>' +
        (modo === "login" ? "¿No tienes cuenta? Crear una" : "Ya tengo cuenta. Iniciar sesión") +
        "</button></div></div>"
      );
    }

    function pintar() {
      var root = layer.abrir(html());
      $("[data-cambiar]", root).addEventListener("click", function () {
        modo = modo === "login" ? "register" : "login";
        error = "";
        pintar();
      });

      $("#formCuenta", root).addEventListener("submit", async function (e) {
        e.preventDefault();
        var f = e.target;
        var email = f.email.value.trim();
        var password = f.password.value;

        if (!/^\S+@\S+\.\S+$/.test(email)) {
          error = "Escribe un correo válido.";
          return pintar();
        }
        if (password.length < 6) {
          error = "La contraseña debe tener al menos 6 caracteres.";
          return pintar();
        }
        if (modo === "register" && f.nombre.value.trim().length < 3) {
          error = "Escribe tu nombre completo.";
          return pintar();
        }

        if (!sb) {
          error = "No se pudo conectar con Supabase. Revisa la consola (F12) para más detalles.";
          return pintar();
        }

        procesando = true;
        error = "";
        pintar();

        try {
          var res;
          if (modo === "login") {
            res = await sb.auth.signInWithPassword({ email: email, password: password });
          } else {
            res = await sb.auth.signUp({
              email: email,
              password: password,
              options: { data: { nombre_completo: f.nombre ? f.nombre.value.trim() : "" } }
            });
          }

          procesando = false;
          if (res.error) {
            error = res.error.message;
            return pintar();
          }

          layer.cerrar();
          toast(modo === "login" ? "¡Bienvenido de nuevo!" : "Cuenta creada correctamente");
        } catch (err) {
          console.error("No se pudo iniciar sesión / registrar con Supabase:", err);
          procesando = false;
          error = "No se pudo conectar con Supabase. Revisa la consola (F12) para más detalles.";
          pintar();
        }
      });
    }

    pintar();
  }

  /* ---------------------------------------------------------
     Acceso al panel de administración
     --------------------------------------------------------- */
  async function intentarAbrirAdmin() {
    if (!sb) {
      toast("No se pudo conectar con Supabase. Revisa la consola (F12) para más detalles.");
      console.error(
        "El botón Administrador necesita el cliente de Supabase (window.sb), pero no está disponible. " +
        "Revisa que exista el archivo js/supabase.js y que js/supabaseClient.js " +
        "tenga la URL y la publishable key correctas."
      );
      return;
    }

    try {
      var sesion = await sb.auth.getSession();
      var user = sesion.data.session ? sesion.data.session.user : null;

      if (user) {
        var perfil = await sb.from("perfiles").select("rol").eq("id", user.id).maybeSingle();
        if (perfil.data && perfil.data.rol === "administrador") {
          return window.PS_ADMIN.abrir();
        }
      }
    } catch (err) {
      console.error("No se pudo verificar la sesión con Supabase:", err);
      toast("Hubo un problema al conectar con Supabase. Revisa la consola (F12).");
    }

    abrirModalAdminLogin();
  }

  function abrirModalAdminLogin() {
    var error = "";
    var verificando = false;

    function html() {
      return (
        '<div class="modal-backdrop"><div class="auth-modal">' +
        '<button class="modal-close" data-cerrar aria-label="Cerrar">' + icon("x", 20) + "</button>" +
        '<p class="eyebrow"><span></span>Acceso seguro</p>' +
        "<h2>Panel de administración</h2>" +
        "<p>Ingresa con una cuenta Supabase que tenga rol administrador.</p>" +
        '<form id="formAdmin">' +
        '<label>Correo electrónico<input name="email" type="email" placeholder="admin@pollossabroson.com" autocomplete="email" /></label>' +
        '<label>Contraseña<input name="password" type="password" placeholder="••••••••" autocomplete="current-password" /></label>' +
        (error ? '<p class="form-error" role="alert">' + esc(error) + "</p>" : "") +
        '<button class="primary-button" type="submit"' + (verificando ? " disabled" : "") + ">" +
        (verificando ? "Verificando..." : "Entrar al panel") + " " + icon("arrow-right", 17) +
        "</button></form></div></div>"
      );
    }

    function pintar() {
      var root = layer.abrir(html());
      $("#formAdmin", root).addEventListener("submit", async function (e) {
        e.preventDefault();
        var f = e.target;
        var email = f.email.value.trim();
        var password = f.password.value;

        if (!/^\S+@\S+\.\S+$/.test(email)) {
          error = "Escribe un correo válido.";
          return pintar();
        }
        if (password.length < 6) {
          error = "La contraseña debe tener al menos 6 caracteres.";
          return pintar();
        }

        verificando = true;
        error = "";
        pintar();

        try {
          var login = await sb.auth.signInWithPassword({ email: email, password: password });
          if (login.error || !login.data.user) {
            verificando = false;
            error = login.error ? login.error.message : "No pudimos iniciar sesión.";
            return pintar();
          }

          var perfil = await sb.from("perfiles").select("rol").eq("id", login.data.user.id).maybeSingle();
          if (perfil.error || !perfil.data || perfil.data.rol !== "administrador") {
            await sb.auth.signOut();
            verificando = false;
            error = "Esta cuenta no tiene permisos de administrador.";
            return pintar();
          }

          verificando = false;
          layer.cerrar();
          window.PS_ADMIN.abrir();
        } catch (err) {
          console.error("No se pudo iniciar sesión con Supabase:", err);
          verificando = false;
          error = "No se pudo conectar con Supabase. Revisa la consola (F12) para más detalles.";
          pintar();
        }
      });
    }

    pintar();
  }

  /* ---------------------------------------------------------
     Carga de datos
     --------------------------------------------------------- */
  async function cargarProductos() {
    var res = await sb
      .from("productos")
      .select("id,categoria,nombre,descripcion,precio,imagen_url,etiqueta,disponible,stock,tamano_etiqueta")
      .eq("disponible", true)
      .order("creado_en", { ascending: true });

    state.cargando = false;

    if (res.error || !res.data || !res.data.length) {
      // Sin conexión o sin catálogo: se mantiene el menú de respaldo.
      if (res.error) console.warn("No se pudo leer productos de Supabase:", res.error.message);
      renderMenu();
      return;
    }

    var deSupabase = res.data.map(D.mapProduct);
    var nombres = {};
    deSupabase.forEach(function (p) {
      nombres[p.name.toLowerCase()] = true;
    });

    // Los productos reales mandan; se completan con los de respaldo que falten.
    var respaldo = D.FALLBACK.filter(function (p) {
      return !nombres[p.name.toLowerCase()];
    });

    state.productos = deSupabase.concat(respaldo);
    renderFiltros();
    renderMenu();
  }

  /* ---------------------------------------------------------
     Marca: nombre visible, título de la pestaña y portada
     --------------------------------------------------------- */

  /** Aplica el nombre del negocio en el logo, el título y el pie. */
  function aplicarNombreNegocio(nombre) {
    nombre = String(nombre || "").trim();
    if (!nombre) return;

    var partes = nombre.split(/\s+/);
    var primera = partes.shift();
    var resto = partes.join(" ");

    $$(".brand-copy").forEach(function (el) {
      el.innerHTML = "<strong>" + esc(primera) + "</strong>" + (resto ? "<em>" + esc(resto) + "</em>" : "");
    });

    $$("[data-brand-name]").forEach(function (el) {
      el.textContent = nombre;
    });

    $$(".brand-mark").forEach(function (el) {
      el.setAttribute("aria-label", nombre);
    });

    document.title = nombre;
  }

  /** Aplica el eslogan como título grande de la portada. Usa "|" para el salto de línea. */
  function aplicarEslogan(eslogan) {
    var el = $("#heroTitulo");
    if (!el || !eslogan) return;

    var partes = String(eslogan).split("|");
    var linea1 = esc(partes.shift().trim());
    var linea2 = esc(partes.join("|").trim());

    el.innerHTML = linea2 ? linea1 + "<br /><i>" + linea2 + "</i>" : linea1;
  }

  /** Muestra en la sección "Ubicación" el mapa de Google Maps guardado
   *  desde el panel admin. Acepta dos tipos de link:
   *   1) Un link de "Insertar mapa" (el que Google da en
   *      Compartir > Insertar un mapa, que empieza con
   *      https://www.google.com/maps/embed?...): se muestra el
   *      mapa real dentro de la tarjeta.
   *   2) Cualquier otro link de Google Maps (el de "Compartir"
   *      normal, como https://maps.app.goo.gl/... o
   *      https://www.google.com/maps/place/...): Google no deja
   *      mostrar ese tipo de link dentro de un iframe, así que en
   *      su lugar se muestra un botón que lo abre en una pestaña
   *      nueva.
   *  Si no hay ningún link guardado, se deja el mapa de adorno que
   *  ya trae el sitio. */
  function aplicarMapa(link) {
    var contenedor = $("#mapaUbicacion");
    if (!contenedor) return;

    link = String(link || "").trim();
    if (!link) return; // sin link: se queda lo que trae la página

    var yaPuesto = contenedor.querySelector("iframe");
    if (yaPuesto && yaPuesto.getAttribute("src") === link) return; // mismo mapa: no recargar

    var esEmbebible = /^https:\/\/www\.google\.com\/maps\/embed/i.test(link);

    if (esEmbebible) {
      contenedor.innerHTML =
        '<iframe src="' + esc(link) + '" loading="lazy" allowfullscreen ' +
        'referrerpolicy="no-referrer-when-downgrade" title="Ubicación en el mapa"></iframe>';
      return;
    }

    contenedor.innerHTML =
      '<a class="map-card-link" href="' + esc(link) + '" target="_blank" rel="noopener">' +
      '<span>' + icon("map-pin", 22) + "</span>" +
      "<strong>Ver ubicación en Google Maps</strong>" +
      "<small>Se abre en una pestaña nueva</small></a>";
  }

  /* ---------------------------------------------------------
     Colores: se inyectan como variables CSS en <html>
     --------------------------------------------------------- */

  /** Normaliza "#abc" o "abc123" a "#aabbcc". Devuelve null si no es un color válido. */
  function normalizarHex(valor) {
    var v = String(valor || "").trim().replace(/^#/, "");
    if (/^[0-9a-fA-F]{3}$/.test(v)) {
      v = v[0] + v[0] + v[1] + v[1] + v[2] + v[2];
    }
    return /^[0-9a-fA-F]{6}$/.test(v) ? "#" + v.toLowerCase() : null;
  }

  /** Mezcla un color hacia negro (factor < 0) o hacia blanco (factor > 0). */
  function mezclar(hex, factor) {
    var base = normalizarHex(hex);
    if (!base) return hex;

    var canales = [1, 3, 5].map(function (i) {
      var n = parseInt(base.substr(i, 2), 16);
      var destino = factor < 0 ? 0 : 255;
      var nuevo = Math.round(n + (destino - n) * Math.abs(factor));
      return Math.max(0, Math.min(255, nuevo)).toString(16).padStart(2, "0");
    });

    return "#" + canales.join("");
  }

  /** Convierte un hex a "r, g, b" para usarlo con transparencias. */
  function canalesRgb(hex) {
    var base = normalizarHex(hex) || "#e65636";
    return [1, 3, 5]
      .map(function (i) {
        return parseInt(base.substr(i, 2), 16);
      })
      .join(", ");
  }

  function aplicarColores(cfg) {
    var raiz = document.documentElement.style;

    var primario = normalizarHex(cfg.color_primario);
    if (primario) {
      raiz.setProperty("--tomato", primario);
      raiz.setProperty("--tomato-deep", mezclar(primario, -0.22));
      raiz.setProperty("--tomato-rgb", canalesRgb(primario));
    }

    var secundario = normalizarHex(cfg.color_secundario);
    if (secundario) {
      raiz.setProperty("--gold", secundario);
    }

    var oscuro = normalizarHex(cfg.color_oscuro);
    if (oscuro) {
      raiz.setProperty("--ink", oscuro);
      raiz.setProperty("--forest", mezclar(oscuro, -0.12));
      raiz.setProperty("--muted-ink", mezclar(oscuro, 0.38));

      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", oscuro);
    }

    // Fondo: ya viene fusionado (config.js manda si tiene valor)
    var fondo = normalizarHex(cfg.color_fondo);
    if (fondo) {
      raiz.setProperty("--paper", fondo);
      raiz.setProperty("--white", fondo);
      raiz.setProperty("--cream", mezclar(fondo, -0.035));
    }
  }

  /** Combina lo guardado en Supabase con js/config.js.
   *  Regla: si config.js tiene un valor, GANA; si está vacío, vale Supabase. */
  function fusionarConfig(db) {
    var m = window.CONFIG_MANUAL || {};
    var mapa = {
      negocio_nombre: "NOMBRE",
      eslogan: "ESLOGAN",
      color_primario: "COLOR_PRIMARIO",
      color_secundario: "COLOR_SECUNDARIO",
      color_oscuro: "COLOR_OSCURO",
      color_fondo: "COLOR_FONDO",
      hero_url: "IMAGEN_PORTADA",
      telefono: "TELEFONO",
      texto_delivery: "TEXTO_DELIVERY",
      direccion: "DIRECCION",
      mapa_url: "MAPA_URL"
    };
    var out = Object.assign({}, db);
    Object.keys(mapa).forEach(function (campo) {
      var manual = String(m[mapa[campo]] || "").trim();
      if (manual) out[campo] = manual;
    });
    return out;
  }

  async function cargarConfiguracion() {
    // Pinta ya los valores de js/config.js, sin esperar a Supabase
    var inicial = fusionarConfig({});
    aplicarColores(inicial);
    aplicarNombreNegocio(inicial.negocio_nombre);
    aplicarEslogan(inicial.eslogan);

    var res = await sb
      .from("configuracion")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    // OJO: aunque Supabase falle o todavía no tenga fila guardada
    // (res.error o !res.data), seguimos ejecutando la función en vez
    // de cortar acá con un "return", para que el color de fondo y la
    // dirección definidos en js/config.js (CONFIG_MANUAL) igual se
    // apliquen como valores por defecto. Por eso usamos "|| {}" abajo.
    var datosConfig = fusionarConfig((res.error || !res.data) ? {} : res.data);

    if (datosConfig.qr_url) state.qrUrl = datosConfig.qr_url;
    if (datosConfig.hero_url) $("#heroImg").src = datosConfig.hero_url;

    aplicarColores(datosConfig);
    aplicarNombreNegocio(datosConfig.negocio_nombre);
    aplicarEslogan(datosConfig.eslogan);
    aplicarMapa(datosConfig.mapa_url);

    var elDelivery = $("#textoDelivery");
    if (elDelivery && datosConfig.texto_delivery) elDelivery.textContent = datosConfig.texto_delivery;

    var elTelefono = $("#telefonoNegocio");
    if (elTelefono && datosConfig.telefono) {
      elTelefono.innerHTML = esc(datosConfig.telefono) + "<br /><small>Pedidos y pagos</small>";
    }

    var elDireccion = $("#direccionNegocio");
    // "Av. Principal 123..." es el texto de ejemplo del SQL: se ignora
    var direccionFinal = /^\s*Av\.?\s*Principal\s*123/i.test(datosConfig.direccion || "") ? "" : datosConfig.direccion;

    if (elDireccion && direccionFinal) {
      var partes = direccionFinal.split(",");
      var linea1 = partes.shift().trim();
      var linea2 = partes.join(",").trim();
      elDireccion.innerHTML = esc(linea1) + (linea2 ? "<br /><small>" + esc(linea2) + "</small>" : "");
    }
  }

  /* ---------------------------------------------------------
     Estado de la tienda (abierta / pausada / fuera de horario)
     --------------------------------------------------------- */
  function pintarBannerTienda() {
    var t = state.tienda;
    var el = $("#storeBanner");
    if (!el) return;
    if (t.abierta) {
      el.hidden = true;
      el.textContent = "";
      document.body.classList.remove("store-closed");
      return;
    }
    el.hidden = false;
    el.innerHTML =
      '<span class="store-banner-dot" aria-hidden="true"></span><span>' +
      esc(t.mensaje || "La tienda está cerrada por ahora.") + "</span>";
    document.body.classList.add("store-closed");
  }

  async function cargarEstadoTienda() {
    if (!sb) return;
    try {
      var res = await sb.rpc("tienda_estado");
      if (res.error || !res.data) return; // sin la migración: la tienda queda abierta
      var antes = state.tienda.abierta;
      state.tienda = {
        abierta: res.data.abierta !== false,
        mensaje: res.data.mensaje || "",
        motivo: res.data.motivo || "",
        hasta: res.data.hasta || ""
      };
      pintarBannerTienda();
      // Si el cajón de la bolsa está abierto y el estado cambió, se repinta
      if (antes !== state.tienda.abierta && $("#formPedido")) {
        var d = {};
        ["nombre", "telefono", "direccion", "notas"].forEach(function (k) {
          var f = $("#formPedido")[k];
          if (f) d[k] = f.value;
        });
        if (repintarCarrito) repintarCarrito(d);
      }
    } catch (e) {
      console.warn("No se pudo leer el estado de la tienda:", e);
    }
  }

  /** Nombre a mostrar: perfil > datos del registro > parte del correo. */
  function nombreDeUsuario(user, perfil) {
    var meta = (user && user.user_metadata) || {};
    var nombre = (perfil && perfil.nombre) || meta.nombre_completo || meta.name || meta.full_name || "";
    nombre = String(nombre).trim();
    if (!nombre && user && user.email) nombre = user.email.split("@")[0];
    return nombre;
  }

  async function actualizarSesion() {
    var res = await sb.auth.getSession();
    var user = res.data.session ? res.data.session.user : null;
    var rol = "cliente";
    var perfilData = null;

    if (user) {
      var perfil = await sb.from("perfiles").select("rol,nombre").eq("id", user.id).maybeSingle();
      perfilData = perfil.data;
      rol = perfilData ? perfilData.rol : "cliente";
    }

    state.sesion = {
      user: user,
      rol: rol,
      nombre: user ? nombreDeUsuario(user, perfilData) : ""
    };

    var btn = $("#btnAccount");
    btn.innerHTML = icon("circle-user-round", 16) + " " + (user ? "Mi sesión" : "Mi cuenta");
    pintarInsigniaUsuario();
  }

  /** Insignia en la esquina del encabezado: nombre del cliente o "Admin". */
  function pintarInsigniaUsuario() {
    var s = state.sesion;
    var wrap = $("#userChipWrap");
    if (!s.user) {
      wrap.hidden = true;
      cerrarMenuUsuario();
      return;
    }
    var esAdmin = s.rol === "administrador";
    var nombre = s.nombre || "Cliente";
    var primerNombre = nombre.split(/\s+/)[0];

    wrap.hidden = false;
    wrap.classList.toggle("is-admin", esAdmin);
    $("#userChipAvatar").textContent = nombre.charAt(0).toUpperCase();
    $("#userChipName").textContent = esAdmin ? "Admin" : primerNombre;
    $("#userChip").title = nombre + (esAdmin ? " (administrador)" : "");
    $("#userMenuName").textContent = nombre + (esAdmin ? " · Admin" : "");
    $("#userMenuEmail").textContent = s.user.email || "";
    $("#userMenuAdmin").hidden = !esAdmin;
  }

  function abrirMenuUsuario() {
    $("#userMenu").hidden = false;
    $("#userChip").setAttribute("aria-expanded", "true");
  }

  function cerrarMenuUsuario() {
    var m = $("#userMenu");
    if (m) m.hidden = true;
    var c = $("#userChip");
    if (c) c.setAttribute("aria-expanded", "false");
  }

  $("#userChip").addEventListener("click", function (e) {
    e.stopPropagation();
    if ($("#userMenu").hidden) abrirMenuUsuario();
    else cerrarMenuUsuario();
  });
  document.addEventListener("click", function (e) {
    if (!e.target.closest("#userChipWrap")) cerrarMenuUsuario();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") cerrarMenuUsuario();
  });
  $("#userMenuAdmin").addEventListener("click", function () {
    cerrarMenuUsuario();
    intentarAbrirAdmin();
  });
  $("#userMenuLogout").addEventListener("click", async function () {
    cerrarMenuUsuario();
    await sb.auth.signOut();
    toast("Sesión cerrada");
  });

  /* ---------------------------------------------------------
     Eventos del encabezado
     --------------------------------------------------------- */
  /* ---------------------------------------------------------
     Buscador (encabezado + campo dentro del menú, siempre sincronizados)
     --------------------------------------------------------- */
  var CAMPOS_BUSQUEDA = ["#searchInput", "#menuSearchInput"];

  /** Guarda el texto, lo copia a los dos campos y repinta el menú. */
  function establecerBusqueda(texto, origen) {
    state.busqueda = texto;
    CAMPOS_BUSQUEDA.forEach(function (sel) {
      var el = $(sel);
      if (el && el !== origen && el.value !== texto) el.value = texto;
    });
    $("#menuSearchClear").hidden = !texto;
    renderMenu();
  }

  /** Lleva la pantalla al menú si los resultados no se están viendo. */
  function mostrarMenu(forzar) {
    var zona = $(".menu-search");
    if (!zona) return;
    var r = zona.getBoundingClientRect();
    var enPantalla = r.top >= 60 && r.top < window.innerHeight * 0.6;
    if (!forzar && enPantalla) return;
    var y = window.pageYOffset + r.top - 84;
    window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
  }

  CAMPOS_BUSQUEDA.forEach(function (sel) {
    var el = $(sel);
    el.addEventListener("input", function () {
      establecerBusqueda(el.value, el);
      if (el.value.trim()) mostrarMenu(false);
    });
    el.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        mostrarMenu(true);
        el.blur();
      } else if (e.key === "Escape" && el.value) {
        establecerBusqueda("", el);
      }
    });
  });

  $("#menuSearchClear").addEventListener("click", function () {
    establecerBusqueda("");
    $("#menuSearchInput").focus();
  });

  // En celular el campo del encabezado no cabe: la lupa lleva al buscador del menú
  $("#btnSearchMobile").addEventListener("click", function () {
    cerrarNavMovil();
    mostrarMenu(true);
    setTimeout(function () {
      $("#menuSearchInput").focus({ preventScroll: true });
    }, 450);
  });

  $("#btnCart").addEventListener("click", abrirCarrito);

  $("#btnAccount").addEventListener("click", async function () {
    cerrarNavMovil();
    if (state.sesion.user) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      abrirMenuUsuario();
      return;
    }
    abrirModalCuenta();
  });

  $("#btnAdmin").addEventListener("click", function () {
    cerrarNavMovil();
    intentarAbrirAdmin();
  });

  $("#btnMobileMenu").addEventListener("click", function () {
    state.navAbierta = !state.navAbierta;
    $("#mainNav").classList.toggle("open", state.navAbierta);
  });

  function cerrarNavMovil() {
    state.navAbierta = false;
    $("#mainNav").classList.remove("open");
  }

  $$("#mainNav a").forEach(function (a) {
    a.addEventListener("click", cerrarNavMovil);
  });

  $("#btnVerTodo").addEventListener("click", limpiarFiltros);

  $("#btnNewsletter").addEventListener("click", function () {
    var input = $("#newsletterInput");
    if (!/^\S+@\S+\.\S+$/.test(input.value.trim())) {
      toast("Escribe un correo válido para suscribirte.");
      return;
    }
    input.value = "";
    toast("¡Listo! Te avisaremos de las próximas promos.");
  });

  /* ---------------------------------------------------------
     Arranque
     --------------------------------------------------------- */
  window.hydrateIcons(document);
  $("#year").textContent = new Date().getFullYear();

  renderCategorias();
  renderFiltros();
  renderMenu();
  actualizarContador();

  if (sb) {
    sb.auth.onAuthStateChange(function () {
      actualizarSesion();
    });
    actualizarSesion();
    cargarProductos();
    cargarConfiguracion();
    cargarEstadoTienda();
    setInterval(cargarEstadoTienda, 60000);
    tracker.info = leerUltimoPedido();
    if (tracker.info) iniciarTracker();
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) cargarEstadoTienda();
    });
  } else {
    state.cargando = false;
    renderMenu();
  }

  // Expuesto para que adminPanel.js pueda volver a la tienda y refrescar datos.
  window.PS_APP = {
    state: state,
    toast: toast,
    esc: esc,
    recargarProductos: cargarProductos,
    recargarConfiguracion: cargarConfiguracion,
    recargarEstadoTienda: cargarEstadoTienda,
    aplicarNombreNegocio: aplicarNombreNegocio,
    aplicarEslogan: aplicarEslogan,
    aplicarMapa: aplicarMapa,
    aplicarColores: aplicarColores,
    sectionHeading: sectionHeading
  };
})();
