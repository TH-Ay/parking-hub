@AGENTS.md

# App de Estacionamientos TheHouse (parking-hub)

## Cómo trabajar con la usuaria
- No sabe programar: explicar en español simple, con analogías, e instrucciones exactas (clic aquí, pega esto allá) para todo lo que sea fuera del código (Supabase, Vercel, GitHub).
- Metodología LEAN: un paso pequeño a la vez. Antes de programar algo complejo, explicar la lógica en español simple y esperar su OK.
- Ahorro de tokens: NUNCA leer ni indexar node_modules/, .next/, .git/ ni .claude/ (excepción: la guía puntual de Next en node_modules/next/dist/docs/ si hace falta). Trabajar solo en app/, components/, lib/ y supabase/. Ediciones puntuales, sin reescribir archivos completos.
- Mantener mapa.txt en la raíz: una línea por archivo creado (sin node_modules). Actualizarlo al crear o mover archivos.
- Al terminar cada paso: decir qué se logró y cuál es el siguiente micro-paso.
- Windows. Carpeta: Documents\parking-hub.

## Privacidad (desde el minuto cero)
- El repo TH-Ay/parking-hub es PÚBLICO (16-nov-2026, para Vercel gratis). Ese día se reemplazó su historial por una sola versión limpia (había un nombre real en un comentario antiguo). El historial antiguo quedó SOLO en la rama local "respaldo-historial": NUNCA subirla (git push solo de main).
- Nombres reales del equipo: viven en Supabase (tabla personas, con RLS y login ACTIVO). Nunca copiarlos a archivos del repo, a mapa.txt, a commits ni a servicios externos.
- components/estacionamientos/personas.local.ts: BORRADO el 19-nov-2026 (ya no se usaba).

## Stack
Next.js 16 (App Router, TypeScript) + Tailwind 4 + Supabase (@supabase/ssr). Luego: GitHub (repo nuevo en la cuenta de la empresa) + Vercel.
- Clientes Supabase: lib/supabase/client.ts (navegador) y lib/supabase/server.ts (servidor).
- Variables en .env.local (no se sube a GitHub); plantilla en .env.example.
- En Next 16 el antiguo "middleware" se llama "proxy" (proxy.ts).

## Negocio (MVP)
- 20 estacionamientos con número: 142, 143, 148, 150, 152, 212 (-3), 302-311, 314, 331, 334, 335.
- Pisos: 142–152 y 212 en subterráneo -3; 302–335 en -4.
- Estacionamientos en teléfono (19-nov-2026): bajo lg la ficha del puesto (y lista de espera) va arriba a todo el ancho y el plano abajo; lado a lado solo desde lg (igual que Disponibilidad). Bajo lg la ficha parte PLEGADA (barra "Estacionamiento X · Ver ficha"); se abre al tocar un puesto o con la barra (fichaAbierta).
- Teléfono (pedido 17-nov-2026): se ve IGUAL que en el computador, achicado. app/layout.tsx exporta viewport { width: 540, initialScale: undefined } + script (Script beforeInteractive) que pone initial-scale = ancho de pantalla ÷ 540. El diseño horizontal (menú a la izquierda, columnas lado a lado) se activa desde sm, que en app/globals.css se cambió a 540 px (@theme --breakpoint-sm: 33.75rem). Se probó 1024, 768 y 640: quedaba chico. Para volver a la versión adaptada al teléfono, borrar ese export.
- Disponibilidad en teléfono (17-nov-2026): bajo lg (1024 px) "Lo tuyo" va arriba a todo el ancho y el calendario abajo; la "P" del título se oculta. Lado a lado solo desde lg.
- Menú lateral PLEGABLE (17-nov-2026, components/Sidebar.tsx): plegado = solo íconos; por defecto plegado en teléfono/pantallas medianas y desplegado en computador (≥ 1024 px); el botón "Plegar" lo cambia y se recuerda en localStorage ("menu-lateral").
- Diseño: menú lateral blanco con logo (public/logo.png); páginas Estacionamientos, Disponibilidad, Personas (contenido lo define la usuaria). Colores en app/globals.css: marca #052a3a, marca-gris #8397a0, acento #13a699. Íconos: lucide-react.
- Cada estacionamiento tiene un dueño. Si el dueño no va, lo LIBERA por uno o más días y otra persona lo puede TOMAR (gana el primero). También se puede SOLTAR uno tomado.
- Reservas por día completo. Regla al TOMAR (cambio 18-nov-2026, supabase/migracion_v2_6.sql): máximo 1 día por semana (lun-vie). Plazo (v2_10): solo esta semana y la siguiente (hasta el viernes de la próxima); más allá se ve "Aún no se abre". FERIADOS (v2_10): tabla feriados (Chile 2026-2027 precargados, revisar cada año); no se toman; en gris "Feriado" en Disponibilidad y en el calendario/listas del admin. ASIGNAR un día ya tomado: gana la asignación, aviso a quien lo tenía. BAJA en plena rotación: queda ≥ 1 mes → siguiente de la lista de espera; menos → periodo "para todos" (es_de_rotacion respeta periodos para_todos también en variables). Antes (v2_5): máx. 2 por semana y nunca 2 días hábiles seguidos.
- Roles: admin (gestiona usuarios, asigna dueños, marca cada estacionamiento como fijo o variable) y usuario (libera, toma, suelta).
- Login con CORREO Y CONTRASEÑA (cambio del 17-nov-2026; antes enlace mágico, que tenía el límite de correos de Supabase). Solo correos @thehouse.cl cargados en Personas pueden "Crear mi contraseña" (la BD rechaza los demás). Requiere en Supabase: Authentication → Email → "Confirm email" APAGADO. "Olvidé mi contraseña" envía correo (con límite) → /auth/callback?next=/nueva-clave. Plan B si no llega: el admin borra el usuario de login en Supabase (Authentication → Users) y la persona vuelve a crear su contraseña (sus datos no se pierden).
- Qué ve cada rol (decidido 16-nov-2026): USUARIO solo ve "Disponibilidad" en el menú y NO puede entrar a Estacionamientos ni Personas: proxy.ts lo redirige a /disponibilidad (cambio pedido 16-nov-2026; antes se veían bloqueadas). Respaldo: SoloAdmin en lib/rol.tsx oculta el contenido. ADMIN ve y usa todo. Inicio "/": admin → /estacionamientos, usuario → /disponibilidad (lo hace proxy.ts). El rol se lee en app/(app)/layout.tsx. La protección real es el RLS de Supabase.
- Fuera del MVP: notificaciones, reportes, visitas.
- RECORDATORIO SEMANAL (19-nov-2026): correo los lunes 17:00 (Chile) a dueños de fijos para que liberen si no van. Lo manda un Apps Script (supabase/recordatorio_apps_script.gs) desde una cuenta Gmail de la empresa; pide la lista a Supabase con rpc recordatorio_fijos(p_clave) (migracion_v2_17.sql; clave en tabla secretos, sin acceso desde la app; se salta a quien ya liberó todo hasta el viernes de la próxima semana). Propiedades del script: SUPABASE_URL, SUPABASE_ANON_KEY, CLAVE_RECORDATORIO, APP_URL (nunca en el repo). Para excluir personas: propiedad del script EXCLUIR (correos separados por coma), solo en Google, nunca en el repo. Notificaciones push: para después.
- REINICIO (13-nov-2026): la usuaria pidió partir de cero. La página Estacionamientos es SOLO un plano demostrativo (número, piso, nombre de ejemplo por puesto), sin reglas, ventanas ni fechas. Las reglas de uso (fijo/variable, liberar, rotación) se vuelven a definir con ella antes de programarlas. Referencia: su planilla tiene dueño permanente por puesto + rotación mensual + casos como "disponible todos los viernes" y 307 = Visitas.

## Flujo del ADMIN — vista Estacionamientos es solo del admin (CONECTADA a Supabase el 16-nov-2026)
- Datos: page.tsx lee estacionamientos + personas + periodos y los convierte al formato Puesto (datosPrueba.ts). Acciones en accionesBD.ts; luego router.refresh(). La ✕ de "Programado" = terminar antes (si ya empezó, hasta = ayer; si no, se borra).
- FIJO: (1) Dueño: elegir persona o "aún sin asignar" (asignar = cambiar, mismo control). La lista muestra solo personas sin fijo + "Aún sin asignar"; se elige y se confirma. Al cambiar de dueño se BORRA todo lo programado del puesto (la app avisa antes qué se borrará); (2) Quitar dueño → pasa a variable; (3) Liberar (UNA sola acción, decidido 16-nov-2026): cuándo = rango de fechas / sin fecha de término / repetir cada semana; para quién = "cualquiera" (lo toma el primero, día a día) o "una persona" (asignación/rotación, ideal mes entero). El dueño conserva su puesto.
- VARIABLE: (1) Pasar a fijo (con dueño o "aún sin asignar"); (2) Asignar a una persona por un periodo; (3) Marcar como especial (ej. 307 Visitas, no se rota).
- CAMBIAR PERSONA (19-nov-2026, migracion_v2_14.sql): en "Programado" cada préstamo/rotación a una persona tiene lápiz ✎ → FormCambiarPersona (en TarjetaPuesto): "Siguiente de la lista" u "Otra persona"; en rotaciones (más de 2 semanas) se elige si quien lo deja vuelve al PRIMER lugar o pasa al FINAL de la lista de espera. public.cambiar_persona(p_periodo, p_nueva, p_lugar): si no empezó cambia para_id; si empezó, corta en ayer y crea uno nuevo desde hoy al mismo fin; borra los "No voy" de la anterior; avisos a ambas; la nueva pasa al final de la lista. La sección de la ficha "Prestado a" se llama ahora "Tomado día a día".
- ESPERANDO ROTACIÓN (19-nov-2026): un libre "para rotación" (esDeRotacion) se dibuja en el grupo Rotación con etiqueta "Esperando rotación" (grupoEn en PlanoEstacionamientos). Su ficha tiene "Dar a la siguiente de la lista" (1 mes desde hoy, primera de la lista sin saltar, sin fijo ni préstamo esos días) → rpc asignar_rotacion (accionesBD.darRotacion). Al liberar para cualquiera algo largo: dos botones "Lo toma cualquiera, día a día" / "Espera la rotación (lista de espera)".
- PLANO DEL DÍA (19-nov-2026): pestaña "Plano del día" con flechas ‹ › (días hábiles, sin límite) y "Volver a hoy"; el plano, la ficha (estado) y las listas de la semana siguen al día elegido (estado "dia" en PlanoEstacionamientos); las acciones de la ficha siguen usando hoy. Listas "Prestados/Libres esta semana" parten plegadas.
- PRÉSTAMO vs ROTACIÓN (cambio 19-nov-2026, migracion_v2_15.sql; antes se decidía por duración): Rotación = periodos.origen "rotacion" (sale de la lista de espera, o el admin enciende "Es rotación (cuenta para la lista de espera)" al Liberar para una persona / Asignar → la persona pasa al final de la lista, trigger rotacion_al_final). Todo lo demás es Préstamo (Prestados, zona "tomados"), dure lo que dure. En "Programado" la etiqueta Préstamo/Rotación se cambia con un clic (accionesBD.cambiarOrigen, no mueve la lista). "Última vez" de la lista de espera solo cuenta rotaciones. PRESTAR ENCIMA: el admin puede prestar un día un puesto que otra persona tiene (rotación o préstamo): la app pide confirmar; la BD crea una cesión (cede_id, por_prestamo = el préstamo) y le avisa; si el préstamo se borra o acorta, esos días vuelven (cascade / al_recuperar); la persona no puede borrar esas cesiones (RLS). Con origen rotacion encima → error. "Prestados esta semana" se arma con estadoAdminEn día a día. En "Lo tuyo": "Te prestaron el X" vs "Te toca el X por rotación".
- TOMADOS en la vista admin (17-nov-2026): leerPuestos trae reservas del último año (Puesto.tomados); estadoAdminEn() en datosPrueba.ts marca zona "tomados" (morado) un libre que alguien tomó. Plano: grupo "P Prestados" (en pantalla se dice "Prestados"; en el código sigue zona "tomados") + lista "Prestados esta semana" (lun–vie, clic abre la ficha); bajo "Libres", lista "Libres esta semana" (por día, chips verde = para todos, ámbar = rotación); Calendario: "Prestado: nombre"; ficha: "Prestado a". Disponibilidad sigue usando estadoEn (sin cambio). Ficha del puesto (18-nov-2026): sección "Tomado por" (desde hoy) con ✕ que pide confirmar → public.quitar_reserva (migracion_v2_8.sql): borra la reserva y avisa a la persona "El admin canceló tu …".
- En ambos: lista de lo programado con ✕ para cancelar/terminar antes (ej. dueño vuelve del postnatal).
- "Fijo aún sin dueño": solo lo ve el admin; los usuarios NO lo ven ni lo pueden tomar (queda bloqueado hasta asignarle dueño).
- Liberar en esta vista: solo admin. Los usuarios liberarán su propio fijo y tomarán disponibles en OTRAS vistas.
- El límite de 2 días seguidos aplica SOLO cuando un usuario toma un puesto (no a lo que asigna el admin).
- Opciones del usuario al liberar su fijo y anticipación para tomar: se definen en la etapa de vistas de usuario.
- Máximo 1 fijo por persona.
- VARIOS PUESTOS (19-nov-2026, migracion_v2_12.sql): casilla personas.varios_puestos ("Puede tener varios puestos el mismo día", en la ventana de la persona; etiqueta en la lista). Para la cuenta "Clientes" (correo inventado, nadie entra con ella): el admin le presta varios puestos el mismo día con Liberar → para una persona (fijos) o Asignar (variables). tiene_puesto devuelve false para esas personas. No agregarla a la lista de espera.
- Personas (decidido 16-nov-2026): el admin CARGA la lista del equipo (nombre + correo @thehouse.cl) antes de que inicien sesión; al entrar, la app las reconoce por el correo.
- BD propuesta (pendiente de escribir): una tabla "periodos" (puesto, desde, hasta|null, dia_semana|null, para_id|null = cualquiera, motivo) que sirve como liberación en fijos y asignación en variables; tipo 'especial' + uso; reservas sigue igual. Al terminar un periodo, el puesto vuelve solo a lo normal.
- Si el dueño vuelve antes (ej. postnatal), el DUEÑO tiene prioridad: al terminar su liberación se cancelan las asignaciones/rotación de esos días restantes (la app debe avisarle al admin a quién se le quita).
- Impedir: dos asignaciones el mismo puesto+día; una persona con dos puestos el mismo día.
- Casos reales que debe cubrir: fijo todo el año; ausencias cortas (vacaciones, viaje, un día); persona se va de la empresa; pre/postnatal sin fecha de vuelta; libres por meses → rotación mensual.

## Vista USUARIO (Disponibilidad) — iteración 1 hecha en memoria
- 2/3 izquierda: calendario de libres (Mes por defecto / Semana / Día), SOLO lunes a viernes. 1/3 derecha: "Lo tuyo" (lo que tiene tomado), separado por una línea.
- Sin límite de anticipación para tomar. Tomar y soltar hechos (soltar agrupa días seguidos, con casillas por día).
- "No voy" del dueño (decidido 16-nov-2026): opciones rango desde–hasta y "cada semana". El dueño puede RECUPERAR lo liberado aunque otra persona ya lo haya tomado → a esa persona le llega el mensaje "Al final sí voy" (CAMBIA la regla/trigger actual de la BD que lo impedía).
- CONECTADA a Supabase (16-nov-2026): tomar = insert en reservas; soltar = delete; "No voy" = insert en periodos (para_id null); recuperar = periodo termina ayer o se borra (la BD avisa "Al final sí voy"); avisos se marcan leído. "Lo tuyo" muestra el panel del dueño si la persona tiene fijo. El interruptor "Ver como" YA SE QUITÓ.

## Vista PERSONAS (decidido 16-nov-2026) — SOLO admin
- Lista del equipo: nombre, correo, rol, puesto fijo, estado (Activa / Aún no entra). Buscador + filtros (Con fijo, Sin fijo, Admins). CONECTADA a Supabase.
- Puesto fijo editable desde la ventana de la persona (cambio pedido 16-nov-2026): lista = su puesto actual + puestos sin dueño (variables o fijos sin dueño; nunca especiales). El anterior queda variable sin dueño; se borra lo programado de ambos (trigger). Quitarle el puesto a OTRA persona: solo desde Estacionamientos.
- Acciones: agregar (de a una, correo @thehouse.cl), editar (nombre, correo, rol), dar de baja (avisa si era dueño → puesto queda sin dueño; se borran sus reservas futuras).
- Ficha por persona: para después.

## ROTACIÓN / LISTA DE ESPERA (diseño acordado 16-nov-2026)
- Avance: PASO 1 hecho = recuadro plegable "Lista de espera" en la columna derecha del Plano (opción B; si no convence, probar pestaña aparte = opción A) + supabase/migracion_v2_1.sql (lista_espera, ajustes, periodos.origen). PASO 2 hecho = botón "Correr / programar rotación" que abre EditorRotacion: el admin elige Desde/Hasta (generales o por puesto) y la persona de cada puesto (o "nadie"), y confirma → public.asignar_rotacion(p_items) (supabase/migracion_v2_3.sql). correr_rotacion() arma la propuesta por defecto (para el automático). PASO 3 = pg_cron (supabase/cron_rotacion.sql): tarea 'rotacion-diaria', lunes a viernes 10:00 UTC (7:00 Chile verano / 6:00 invierno) → correr_rotacion(). Requiere activar la extensión pg_cron en Supabase. ✅ ACTIVADO el 19-nov-2026 (pg_cron encendido, tarea rotacion-diaria; desde v2_16 reparte el próximo turno mensual una semana antes). Paso siguiente: 4) regla del 50%.
- Lista de espera ordenada (solo la ve el admin): personas sin fijo. Admin agrega, quita, reordena (↑↓) y puede marcar "saltar el próximo turno" (conserva su lugar). Quien recibe fijo o es dado de baja sale solo de la lista.
- "Libre para rotar" = fijo liberado para cualquiera SIN fecha de término o por AL MENOS 1 MES desde hoy, o variable sin nadie asignado. Lo más corto queda "para cualquiera" día a día (MVP: sin otros umbrales).
- TURNOS MENSUALES (19-nov-2026, migracion_v2_16.sql; REEMPLAZA lo de "un mes desde hoy" de abajo): cada semana lun–vie es del mes donde cae su jueves; turno = lunes de su primera semana → viernes antes del turno siguiente (dic-2026 = 30-11 → 01-01; ene-2027 = 04-01 → 29-01). BD: mes_del_turno, inicio_turno, fin_turno, libre_para_rotar_en; correr_rotacion() reparte el PRÓXIMO turno solo desde una semana antes (aviso "¡Te tocó el X por rotación!" lo da asignar_rotacion; excluye personas con varios_puestos). App: turnoDe/finDelTurno/turnoSiguiente en fechas.ts; EditorRotacion parte en el próximo turno; "Dar a la siguiente" va de hoy al fin del turno. Automático ACTIVO desde el 19-nov-2026.
- Automático: cada mañana de día hábil (lunes a viernes) la BD revisa; cada puesto libre para rotar sin asignar se le da al PRIMERO de la lista por UN MES (desde hoy hasta el día anterior del mes siguiente, ej. 15-11 → 14-12) y esa persona pasa al FINAL. La lista corre también a mitad de mes.
- Si a esa persona le toca la rotación y tenía tomados días sueltos de otro puesto en ese periodo → se le liberan (quedan para cualquiera) y recibe aviso.
- Si OTRA persona había tomado un día suelto del puesto que entra a rotación → gana la rotación: se le cancela ese día con aviso.
- Dueño vuelve antes (recupera): la asignación se corta; si la persona usó MENOS del 50% de los días hábiles del mes → vuelve al PRIMER lugar; si 50% o más → queda al final. El 50% es un ajuste editable por el admin.
- Avisos: a la persona ("Te tocó el 142 del … al …") y al admin (resumen de lo asignado). El admin corrige a mano si algo no le convence.

- RESERVADOS PARA ROTACIÓN (16-nov-2026, migracion_v2_4.sql): un puesto "de rotación" (fijo con liberación para cualquiera sin término o de 1 mes o más, sin "cada semana"; o variable sin asignar) NO se toma día a día: no aparece en Disponibilidad y la BD lo impide (es_de_rotacion en validar_reserva). Excepción: el admin marca al liberar "Que cualquiera lo pueda tomar día a día" (periodos.para_todos = true). En el plano se ven en Libres con etiqueta "Para rotación". Regla compartida en la app: esDeRotacion() en datosPrueba.ts.
- VARIABLES "DÍA A DÍA" (18-nov-2026, migracion_v2_7.sql): casilla permanente estacionamientos.dia_a_dia, se enciende en la tarjeta del variable ("Que cualquiera lo pueda tomar día a día"). Encendida: no es de rotación (es_de_rotacion y libre_para_rotar), aparece en Disponibilidad; plano muestra "Día a día". Al cambiar de tipo se apaga sola (accionesBD).
- PARA TODOS POR DEFECTO (18-nov-2026, migracion_v2_9.sql): lo libre es para todos salvo que el admin lo apague. Variables: dia_a_dia default true (al pasar a variable, true). Liberaciones: para_todos default true (incluye "No voy" del dueño); FormLiberar parte marcado. En "Programado", cada liberación larga para cualquiera tiene etiqueta clicable "Para todos" / "Para rotación" (accionesBD.cambiarParaTodos).
- En Disponibilidad → "Lo tuyo", la persona ve "Te toca el X por rotación" (En curso / Próximamente) durante todo el periodo (PanelDueno con color ámbar). "NO VOY" EN ROTACIÓN (19-nov-2026, migracion_v2_11.sql): puede liberar días de su turno (rango o cada semana; la app los recorta al turno); quedan para todos (periodo con cede_id = quien libera, para_id null, para_todos). No pierde el mes ni su lugar. Recupera con ✕ (aviso "Al final sí voy" a quien lo tomó). Si la asignación se acorta o borra, al_recuperar ajusta sus cedidos. En la app: Puesto.cedidos (lib/puestosBD.ts), estadoEn los muestra libres; en "Programado" del admin con clave ced-. Pendiente: decidir si cuentan para la regla del 50%.
- PRÓXIMA ITERACIÓN: enviar CORREO a la persona cuando le toca la rotación (hoy solo aviso dentro de la app).

## Pendiente para más adelante (pedido 16-nov-2026)
- Vista general del ADMIN (en Estacionamientos): calendario semanal / mensual / anual para ver la situación: puestos libres sin usar, fijos sin dueño, etc. Definir con la usuaria después de la vista Disponibilidad.

## Supabase v2 (escrita 16-nov-2026 en supabase/migracion_v2.sql; la aplica la usuaria en el SQL Editor)
- personas (reemplaza profiles): la carga el admin; user_id se une al iniciar sesión por correo. Correo fuera de la lista → NO entra (decidido: opción 1). activa=false = dada de baja.
- estacionamientos: numero, piso, tipo fijo|variable|especial, dueno_id único (1 fijo por persona), uso_especial. Parten todos "variable" salvo 307 = Visitas.
- periodos (reemplaza liberaciones): desde, hasta|null, dia_semana 1-5|null, para_id|null (null = cualquiera), motivo.
- reservas (persona_id, fecha) y avisos (persona_id, texto, leido).
- Triggers: validar_reserva, validar_periodo, al_recuperar (avisos "Al final sí voy"), al_cambiar_puesto, al_dar_de_baja. Funciones: mi_persona_id(), es_admin(), libre_para_tomar(), tiene_puesto().
- La primera admin se carga con un SQL aparte que NO se guarda en el repo (tiene su correo).
- Lo de abajo describe la v1 (referencia histórica en supabase/schema.sql).

## Supabase v1 (YA CREADO, no recrear)
Proyecto "Gestión estacionamientos". Tablas en public:
- profiles (id = auth.users.id, email, nombre, rol 'admin'|'usuario'). Se crea sola con trigger al registrarse; rechaza correos que no son @thehouse.cl.
- estacionamientos (id, numero text, tipo 'fijo'|'variable', dueno_id → profiles).
- liberaciones (estacionamiento_id, fecha), única por estacionamiento y fecha.
- reservas (estacionamiento_id, usuario_id, fecha), única por estacionamiento+fecha y por usuario+fecha.
Triggers que ya validan en la BD: solo se puede tomar si es variable, no tiene dueño o fue liberado ese día; máximo 2 días seguidos; no fechas pasadas (hora de Chile); el dueño no puede recuperar su estacionamiento si otra persona ya lo tomó (⚠️ esta última regla CAMBIA: ahora sí puede, y se avisa "Al final sí voy" a quien lo tenía). Los errores llegan en español: mostrarlos tal cual al usuario.
RLS activo: todos los logueados leen; cada uno inserta y borra solo lo suyo; el admin puede todo (función public.es_admin()).

## Plan
1. Base de datos ✅
2a. App base + conexión a Supabase + CLAUDE.md + mapa.txt ✅
2b. Login con enlace mágico (redirigir a /login si no hay sesión) ✅ — ENCENDIDO de nuevo el 16-nov-2026 (LOGIN_ACTIVO = true en proxy.ts). El portero además cierra la sesión si la persona no está en "personas" o fue dada de baja (→ /login?error=lista).
3. Vista del día (estado de cada estacionamiento: libre/ocupado)  ← SIGUIENTE
   Ojo: next.config tiene cacheComponents: true → lo que lee sesión/BD va dentro de <Suspense> (createClient del servidor ya llama connection()). No usar redirect() en páginas estáticas: usar redirects en next.config.ts.
4. Botones liberar / tomar / soltar
5. Panel admin
6. GitHub + Vercel ✅ (16-nov-2026) — Vercel (plan Hobby, equipo "TheHouse Advisory's projects", proyecto "parking-hub") despliega solo cada push a main de TH-Ay/parking-hub (público). Variables en Vercel: NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY. En Supabase → Authentication → URL Configuration: Site URL = dirección de Vercel; Redirect URLs = Vercel/** y http://localhost:3000/**.
7. Ingreso rápido del equipo ✅ (17-nov-2026): se cambió a correo + contraseña (Gmail como SMTP no resultó: Google no dejaba verificar la cuenta). SIGUIENTE: revisar la versión en el teléfono.
