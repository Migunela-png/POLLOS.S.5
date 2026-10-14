/* =========================================================
   Pollos Sabroson — supabaseClient.js

   Configuración pública de Supabase.
   La publishable key / anon key se puede usar en el navegador.
   NUNCA coloques aquí una service_role key ni ninguna clave secreta.
   ========================================================= */
(function () {
  "use strict";

  var SUPABASE_URL = "https://dmuevqcufexwflndyxxf.supabase.co";
  var SUPABASE_PUBLISHABLE_KEY = "sb_publishable_TEwKox62C4kultI0iWQnag_eQqVof1C";

  if (!window.supabase) {
    console.error(
      "No se cargó el SDK de Supabase. Revisa que exista el archivo js/supabase.js y que la etiqueta <script> en index.html lo referencie correctamente."
    );
    return;
  }

  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    console.error(
      "Supabase no está configurado. Edita js/supabaseClient.js con la URL y la publishable key de tu proyecto."
    );
    return;
  }

  // Cliente único, reutilizado por app.js, adminPanel.js y adminCrud.js
  window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
})();
