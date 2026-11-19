// =====================================================================================
// RECORDATORIO SEMANAL A LOS DUEÑOS DE FIJOS (Google Apps Script) — 19-nov-2026
// Se pega en script.google.com (proyecto nuevo) con la cuenta de Gmail de estacionamientos.
// Los lunes entre 17:00 y 18:00 (hora de Chile) manda un correo a cada dueño de un fijo para que libere
// su puesto si no lo va a usar. La lista viene de Supabase (función recordatorio_fijos, migracion_v2_17.sql).
//
// Datos que van en "Configuración del proyecto" → "Propiedades del script" (NO en este archivo):
//   SUPABASE_URL        → igual que NEXT_PUBLIC_SUPABASE_URL de .env.local
//   SUPABASE_ANON_KEY   → igual que NEXT_PUBLIC_SUPABASE_ANON_KEY de .env.local
//   CLAVE_RECORDATORIO  → el valor de: select valor from public.secretos where clave = 'recordatorio';
//   APP_URL             → la dirección de la app en Vercel (ej. https://....vercel.app)
//   EXCLUIR (opcional)  → correos a los que NUNCA se les manda, separados por coma (ej. a@thehouse.cl, b@thehouse.cl)
//
// Funciones:
//   probar()          → te manda a TI un correo de muestra y la lista de a quiénes les llegaría (no manda a nadie más)
//   crearActivador()  → deja programado el envío de los lunes a las 17:00 (correrla UNA sola vez)
//   enviarRecordatorio() → la que corre sola cada lunes
// =====================================================================================

function config_() {
  const p = PropertiesService.getScriptProperties();
  const c = {
    url: p.getProperty('SUPABASE_URL'),
    anon: p.getProperty('SUPABASE_ANON_KEY'),
    clave: p.getProperty('CLAVE_RECORDATORIO'),
    app: p.getProperty('APP_URL'),
    // Correos excluidos (en minúsculas, sin espacios)
    excluir: String(p.getProperty('EXCLUIR') || '')
      .split(',')
      .map(function (e) { return e.trim().toLowerCase(); })
      .filter(function (e) { return e; }),
  };
  if (!c.url || !c.anon || !c.clave || !c.app) throw new Error('Faltan propiedades del script (SUPABASE_URL, SUPABASE_ANON_KEY, CLAVE_RECORDATORIO, APP_URL).');
  return c;
}

// Pide a Supabase la lista de dueños a recordar: [{ nombre, email, numero }]
function duenos_(c) {
  const res = UrlFetchApp.fetch(c.url.replace(/\/$/, '') + '/rest/v1/rpc/recordatorio_fijos', {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: c.anon, Authorization: 'Bearer ' + c.anon },
    payload: JSON.stringify({ p_clave: c.clave }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) throw new Error('Supabase respondió ' + res.getResponseCode() + ': ' + res.getContentText());
  // Se sacan los correos de EXCLUIR: a ellos nunca les llega
  return JSON.parse(res.getContentText()).filter(function (d) {
    return c.excluir.indexOf(String(d.email).toLowerCase()) === -1;
  });
}

// Correo para una persona
function correo_(d, c) {
  const primerNombre = String(d.nombre).split(' ')[0];
  const link = c.app.replace(/\/$/, '') + '/disponibilidad';
  const asunto = '¿Usarás tu estacionamiento ' + d.numero + ' esta semana o la próxima?';
  const texto =
    'Hola ' + primerNombre + ':\n\n' +
    'Si no vas a usar tu estacionamiento ' + d.numero + ' algún día de esta semana o la próxima ' +
    '(taller, viaje, vacaciones, teletrabajo…), libéralo para que otra persona lo pueda usar.\n\n' +
    'Liberarlo: ' + link + '  →  "Lo tuyo" → "No voy"\n\n' +
    'Si al final sí vas, lo recuperas desde el mismo lugar.\n\n' +
    'Estacionamientos TheHouse';
  const html =
    '<div style="font-family:Arial,sans-serif;font-size:15px;color:#052a3a;max-width:520px">' +
    '<p>Hola ' + primerNombre + ':</p>' +
    '<p>Si no vas a usar tu estacionamiento <b>' + d.numero + '</b> algún día de esta semana o la próxima ' +
    '(taller, viaje, vacaciones, teletrabajo…), libéralo para que otra persona lo pueda usar.</p>' +
    '<p><a href="' + link + '" style="display:inline-block;background:#13a699;color:#fff;padding:10px 18px;' +
    'border-radius:6px;text-decoration:none;font-weight:bold">Liberar mi estacionamiento</a></p>' +
    '<p style="color:#8397a0;font-size:13px">En la app: "Lo tuyo" → "No voy". Si al final sí vas, lo recuperas desde el mismo lugar.</p>' +
    '<p style="color:#8397a0;font-size:13px">Estacionamientos TheHouse</p></div>';
  return { asunto: asunto, texto: texto, html: html };
}

// La que corre sola cada lunes
function enviarRecordatorio() {
  const c = config_();
  const lista = duenos_(c);
  lista.forEach(function (d) {
    const m = correo_(d, c);
    GmailApp.sendEmail(d.email, m.asunto, m.texto, { htmlBody: m.html, name: 'Estacionamientos TheHouse' });
  });
  console.log('Recordatorios enviados: ' + lista.length);
}

// Prueba: te manda a ti un correo de muestra con la lista de a quiénes les llegaría
function probar() {
  const c = config_();
  const lista = duenos_(c);
  const yo = Session.getActiveUser().getEmail();
  const muestra = lista.length ? correo_(lista[0], c) : correo_({ nombre: 'Prueba', numero: '000' }, c);
  const quienes = lista.map(function (d) { return d.numero + ' · ' + d.nombre + ' · ' + d.email; }).join('<br>') || '(nadie esta semana)';
  GmailApp.sendEmail(yo, '[PRUEBA] ' + muestra.asunto, muestra.texto, {
    htmlBody: '<p><b>PRUEBA — solo te llega a ti.</b> Este lunes se mandaría a ' + lista.length + ' persona(s):<br>' + quienes + '</p>' +
      '<p style="color:#8397a0">Excluidos (propiedad EXCLUIR): ' + (c.excluir.join(', ') || '(ninguno: revisa el nombre de la propiedad)') + '</p><hr>' + muestra.html,
    name: 'Estacionamientos TheHouse',
  });
  console.log('Prueba enviada a ' + yo + '. Destinatarios del lunes: ' + lista.length);
}

// Deja programado el envío de los lunes a las 17:00 hora de Chile (correr UNA sola vez)
function crearActivador() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'enviarRecordatorio'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('enviarRecordatorio')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(17)
    .inTimezone('America/Santiago')
    .create();
  console.log('Listo: el recordatorio se enviará cada lunes entre 17:00 y 18:00 (hora de Chile).');
}
