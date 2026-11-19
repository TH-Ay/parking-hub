# App de Estacionamientos TheHouse — Contexto para hacer mejoras

> Documento para dos tipos de lectores:
> - **Personas que no son de TI** y quieren entender cómo funciona la app para pedir mejoras.
> - **Quien programa** (una persona o una IA como Claude) y necesita saber cómo está armada antes de cambiarla.
>
> Actualizado: 19-nov-2026. Aquí no hay nombres reales, correos ni claves: esos datos viven solo en Supabase y en la configuración de cada servicio.

---

## 1. Para qué existe

TheHouse tiene **20 estacionamientos** y más personas que puestos. La app reemplaza la planilla y los mensajes de ida y vuelta.

**Objetivo:** que **ningún estacionamiento quede sin usar** y que **nadie dependa de un intermediario** para conseguir o liberar uno.

**Puestos:** 142, 143, 148, 150, 152 y 212 (subterráneo -3); 302 a 311, 314, 331, 334 y 335 (subterráneo -4). El 307 se usa como "Visitas" (puesto especial).

---

## 2. Glosario (las palabras de la app)

| Palabra | Qué significa |
|---|---|
| **Fijo** | Puesto que tiene un **dueño** que lo usa todos los días. Máximo 1 fijo por persona. |
| **Fijo sin dueño** | Fijo al que aún no se le asigna dueño. Solo lo ve el admin; nadie lo puede tomar. |
| **Variable** | Puesto sin dueño. Se toma día a día o se reparte por rotación. |
| **Especial** | Puesto con un uso fijo (ej. Visitas). No se rota ni se toma. |
| **Liberar / "No voy"** | El dueño (o quien tiene un préstamo o rotación) avisa que no lo usará ciertos días. Esos días otra persona lo puede usar. |
| **Recuperar / "Al final sí voy"** | Deshacer una liberación. Si alguien ya lo había tomado, se le cancela y recibe un aviso. |
| **Tomar** | Una persona reserva un puesto libre por **un día**. Gana el primero que lo toma. |
| **Soltar** | Devolver un día que tomaste. |
| **Para todos / día a día** | Lo libre lo puede tomar cualquiera, día a día. Es lo que pasa por defecto. |
| **Para rotación / Esperando rotación** | Un puesto libre por mucho tiempo que **no** se toma día a día: espera a que la lista de espera lo reparta. |
| **Préstamo** | El admin le da un puesto a **una persona** por un periodo (un día, una semana, lo que sea). Aparece en "Prestados". |
| **Rotación** | Un préstamo que sale de la **lista de espera** y cuenta como el turno de esa persona. Aparece en "Rotación". |
| **Lista de espera** | Fila ordenada de personas sin fijo. Cada turno, los primeros reciben un puesto y pasan al final. |
| **Saltar turno** | Marca para que una persona no reciba puesto en el próximo reparto, sin perder su lugar. |
| **Turno mensual** | Periodo de una rotación. Va de lunes a viernes y sigue el mes (ver sección 5). |
| **Clientes** | Cuenta especial (nadie inicia sesión con ella) a la que el admin le puede prestar **varios puestos el mismo día**. |
| **Avisos** | Mensajes dentro de la app (en "Lo tuyo"), por ejemplo "Te tocó el 142 por rotación". |

---

## 3. Quién ve qué

**Inicio de sesión:** correo `@thehouse.cl` y contraseña. Solo entran personas que el admin cargó en **Personas**. La primera vez cada persona hace clic en "Crear mi contraseña".

| Rol | Qué ve | Qué puede hacer |
|---|---|---|
| **Usuario** | Solo **Disponibilidad** | Tomar y soltar días libres. Si tiene un fijo, un préstamo o una rotación: "No voy" y recuperar. Ve sus avisos. |
| **Admin** | **Estacionamientos**, **Disponibilidad** y **Personas** | Todo lo anterior, más configurar puestos, prestar, rotar, cambiar personas y administrar el equipo. |

### Disponibilidad (todos)
- **Calendario** (mes, semana o día, solo de lunes a viernes) con los puestos libres en verde. Se toca uno para tomarlo.
- **"Lo tuyo"**: tu fijo, préstamo o rotación (con botón "No voy" y la lista de días que liberaste), los días que tomaste (con "Soltar") y tus avisos.
- En el teléfono, "Lo tuyo" va arriba y el calendario abajo.

### Estacionamientos (solo admin)
- **Plano del día**: los puestos agrupados en **Fijos**, **Rotación**, **Prestados** y **Libres**. Con las flechas ‹ › se mira otro día hábil.
- **Ficha del puesto** (al tocarlo): datos, acciones (dueño, liberar, asignar, pasar a fijo/variable/especial), **Programado** (liberaciones, préstamos y rotaciones, con ✎ para cambiar la persona, ✕ para cancelar y la etiqueta Préstamo/Rotación) y **Tomado día a día**.
- **Esperando rotación**: botón "Dar a la siguiente de la lista", con fechas editables.
- **Lista de espera**: ordenar, agregar, quitar, saltar turno y "Correr / programar rotación".
- **Calendario**: vista por semana, mes o año, con alertas.
- En el teléfono, la ficha va arriba, **plegada**, y se abre al tocar un puesto.

### Personas (solo admin)
- Lista del equipo con buscador y filtros: agregar, editar (nombre, correo, rol, puesto fijo, "puede tener varios puestos el mismo día") y dar de baja.

---

## 4. Reglas del negocio

Las reglas importantes las hace cumplir la **base de datos**: aunque alguien se salte la pantalla, no puede romperlas. Los errores llegan en español y la app los muestra tal cual.

**Al tomar un día**
- Solo de lunes a viernes, sin fechas pasadas y sin feriados (tabla de feriados de Chile 2026–2027; **hay que cargar los años siguientes**).
- Solo esta semana y la siguiente (hasta el viernes de la próxima). Más allá se ve "Aún no se abre".
- Máximo **1 día por semana** por persona.
- Una persona no puede tener dos puestos el mismo día (excepto cuentas con "varios puestos", como Clientes).
- No se toma un puesto "Esperando rotación" ni un fijo sin dueño.

**Liberar y recuperar**
- El dueño libera con "No voy" (un rango o "cada semana"). Por defecto queda **para todos**.
- Quien tiene un préstamo o rotación también puede hacer "No voy", **solo dentro de sus fechas**. No pierde su turno.
- Recuperar siempre se puede. Si alguien lo había tomado, se le cancela con el aviso "Al final sí voy".

**Préstamos del admin**
- **Préstamo** (morado, "Prestados") o **Rotación** (ámbar), según la marca "Es rotación", no según la duración.
- Prestar encima de alguien que ya tiene el puesto esos días: gana el préstamo nuevo, la otra persona **cede** esos días y recibe un aviso. Si el préstamo se cancela, los días vuelven a ella.
- Asignar un día que alguien había tomado: gana la asignación y esa persona recibe un aviso.
- ✎ **Cambiar persona**: si ya empezó, la anterior lo tuvo hasta ayer y la nueva lo tiene desde hoy hasta el mismo fin. En rotaciones se elige si quien lo deja vuelve al **primer lugar** o pasa al **final** de la lista.

**Bajas y cambios de dueño**
- Dar de baja a una persona: su fijo queda sin dueño y se borran sus reservas futuras. Si estaba en plena rotación: si queda 1 mes o más, pasa a la siguiente de la lista; si queda menos, queda "para todos".
- Cambiar el dueño o el tipo de un puesto **borra lo programado** de ese puesto. La app avisa antes qué se borrará.

---

## 5. Rotación mensual (cómo funciona la lista de espera)

**Turnos:** cada semana (lunes a viernes) pertenece al mes donde cae su **jueves**, que es donde están la mayoría de sus días. El turno de un mes va del lunes de su primera semana al viernes anterior al turno siguiente. Por eso los turnos duran 4 o 5 semanas y nunca quedan días sueltos.

| Turno | Desde | Hasta |
|---|---|---|
| Noviembre 2026 | lun 2 nov | vie 27 nov |
| Diciembre 2026 | lun 30 nov | vie 1 ene |
| Enero 2027 | lun 4 ene | vie 29 ene |
| Abril 2027 | lun 29 mar | vie 30 abr |

**Reparto automático:** la semana anterior a cada turno (desde el lunes), cada mañana hábil a las 7:00:
1. busca los puestos que estarán "Esperando rotación" durante **todo** el turno;
2. se los da a las primeras personas de la lista (salta a quien marcó "saltar turno", a quien tiene fijo, a quien ya tiene un préstamo esos días y a las cuentas con varios puestos);
3. cada persona pasa al final de la lista y recibe el aviso "¡Te tocó el X por rotación!";
4. el admin recibe un resumen. Si ya se repartió, no hace nada.

**A mano:** "Dar a la siguiente de la lista" (un puesto, desde hoy hasta el fin del turno) o "Correr / programar rotación" (varios puestos, parte por defecto en el próximo turno).

**Qué entra a rotación:** un fijo liberado "para rotación" sin fecha de término (o que cubra todo el turno), o un variable con "día a día" apagado.

---

## 6. Automatizaciones

| Qué | Cuándo | Dónde vive |
|---|---|---|
| Reparto de la rotación | Lunes a viernes, 10:00 UTC (7:00 de Chile en verano). Solo actúa la semana antes de un turno. | Supabase, extensión **pg_cron**, tarea `rotacion-diaria` → función `correr_rotacion()` (archivo `supabase/cron_rotacion.sql`). |
| Recordatorio a dueños de fijos ("libéralo si no lo usarás") | Lunes entre 17:00 y 18:00 (hora de Chile) | **Google Apps Script** en una cuenta de Gmail de la empresa (código en `supabase/recordatorio_apps_script.gs`). Solo a dueños de fijos que aún usarían su puesto algún día de esta semana o la próxima. |

**Detalles del recordatorio:**
- La lista de destinatarios la entrega Supabase con la función `recordatorio_fijos(p_clave)`, **solo** con una clave secreta guardada en la tabla `secretos`.
- La configuración del script va en sus **Propiedades** (nunca en el código): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `CLAVE_RECORDATORIO`, `APP_URL` y `EXCLUIR` (correos que nunca lo reciben, separados por coma).
- La función `probar` manda una muestra solo a la cuenta que lo ejecuta. **Nunca ejecutar `enviarRecordatorio` a mano**: le manda el correo a todos en ese momento.

---

## 7. Cómo está construido (para quien programa)

**Herramientas:** Next.js 16 (App Router, TypeScript) + Tailwind 4 + Supabase (base de datos Postgres, login y permisos) + Vercel (publicación) + GitHub.
- En Next 16 el antiguo "middleware" se llama **proxy** (`proxy.ts`). Antes de usar una función de Next, revisa la guía de `node_modules/next/dist/docs/`, porque esta versión cambió varias cosas.
- `next.config.ts` tiene `cacheComponents: true`: lo que lee la sesión o la base de datos va dentro de `<Suspense>`.

**Carpetas** (el detalle de cada archivo está en `mapa.txt`):
- `app/`: páginas. `(app)/estacionamientos`, `(app)/disponibilidad`, `(app)/personas`, `login`, `nueva-clave`, `auth/`.
- `components/estacionamientos/`: vista del admin (plano, ficha, formularios, lista de espera, calendario, fechas y turnos).
- `components/disponibilidad/`: vista del usuario (calendario, "Lo tuyo", panel del dueño).
- `components/personas/`: vista de Personas.
- `lib/`: conexión a Supabase (`supabase/client.ts` para el navegador, `supabase/server.ts` para el servidor), lectura de puestos (`puestosBD.ts`), rol, errores.
- `supabase/`: scripts SQL (migraciones numeradas), cron y Apps Script.
- `proxy.ts`: portero. Sin sesión → `/login`; usuario → solo `/disponibilidad`; persona dada de baja → fuera.

**Piezas clave del código:**
- `components/estacionamientos/datosPrueba.ts`: modelo `Puesto` y las reglas para saber cómo está un puesto en una fecha (`estadoEn`, `estadoAdminEn`, `esDeRotacion`, `programadoDe`). Lo usan el plano y los calendarios.
- `components/estacionamientos/fechas.ts`: fechas en hora de Chile y **turnos** (`turnoDe`, `finDelTurno`, `turnoSiguiente`), con la misma regla que la base de datos.
- `components/estacionamientos/accionesBD.ts`: todo lo que el admin guarda en Supabase.
- `lib/puestosBD.ts`: lee puestos, personas, periodos, reservas y feriados, y los convierte al modelo `Puesto`.

**Base de datos (Supabase, esquema `public`):**

| Tabla | Para qué |
|---|---|
| `personas` | Equipo (nombre, correo, rol, activa, `varios_puestos`). `user_id` se une al iniciar sesión. |
| `estacionamientos` | Número, piso, tipo (fijo, variable o especial), dueño, uso especial, `dia_a_dia`. |
| `periodos` | **Todo lo programado**: liberaciones (`para_id` nulo), préstamos y rotaciones (`para_id` = persona; `origen` 'manual' o 'rotacion'), "No voy" de quien tiene un préstamo (`cede_id`) y cesiones por un préstamo encima (`por_prestamo`). Campos: `desde`, `hasta` (nulo = sin término), `dia_semana` (cada semana), `para_todos`, `motivo`. |
| `reservas` | Días tomados (persona, puesto, fecha). |
| `avisos` | Mensajes dentro de la app. |
| `lista_espera` | Orden y "saltar". |
| `feriados` | Feriados de Chile. |
| `ajustes` | Valores editables (ej. el 50% de la regla pendiente). |
| `secretos` | Claves internas (sin acceso desde la app). |

**Funciones y triggers importantes:** `validar_reserva` (reglas al tomar), `validar_periodo` (reglas al programar, préstamo encima, "No voy" de rotación), `al_recuperar` (avisos y limpieza al cancelar o acortar), `libre_para_tomar`, `tiene_puesto`, `cedido`, `es_de_rotacion`, `libre_para_rotar_en`, `inicio_turno` / `fin_turno` / `mes_del_turno`, `asignar_rotacion`, `correr_rotacion`, `cambiar_persona`, `quitar_reserva`, `recordatorio_fijos`, `es_admin`, `mi_persona_id`, `hoy_chile`.

**Permisos (RLS):** todas las personas con sesión leen. Cada una inserta y borra solo lo suyo. El admin puede todo. **La protección real está en la base de datos**; la pantalla solo esconde botones.

**Migraciones:** `supabase/migracion_v2.sql` y luego `v2_1` … `v2_17`, en orden. Cada una dice arriba qué cambia. Se aplican **a mano** en Supabase → SQL Editor → Run. `schema.sql` es la versión 1, solo como referencia histórica. Una mejora que toque reglas casi siempre necesita una migración nueva (`v2_18`, …) que **reemplaza la función completa** partiendo de su última versión.

**Publicación:** cada cambio se trabaja en una **rama** (ej. `cambios-19nov`) → se prueba en `localhost:3000` (`npm run dev`) → pull request a `main` en GitHub → al unirlo, **Vercel publica solo**. Variables en Vercel: `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`. En local van en `.env.local` (no se sube; la plantilla está en `.env.example`).

---

## 8. Privacidad y seguridad (no negociable)

- El repositorio de GitHub es **público**. Nunca subir nombres reales, correos, claves ni el archivo `.env.local`.
- Los nombres del equipo viven **solo** en Supabase (tabla `personas`).
- La rama local `respaldo-historial` tiene historia antigua con un dato privado: **nunca subirla**.
- Claves (de Supabase, del recordatorio): solo en `.env.local`, Vercel o las Propiedades del Apps Script.
- La clave "anon" de Supabase es pública por diseño. Lo que protege los datos son los permisos (RLS) y las funciones con clave.

---

## 9. Cómo pedir una mejora (sobre todo si no eres de TI)

Una buena petición dice:
1. **Qué ves hoy** (idealmente con una captura de pantalla).
2. **Qué quieres que pase** y **para quién** (admin, usuario o todos).
3. **Un caso real** con números de puesto, sin nombres (ej. "el 302 es fijo; el dueño no viene el jueves y se lo quiero prestar a otra persona").
4. Si es en **teléfono** o en **computador**.

**Forma de trabajo acordada (LEAN):**
- Un paso pequeño a la vez, probado en `localhost:3000` antes de seguir.
- Antes de programar algo complejo, quien programa explica la lógica en 3 a 5 viñetas y espera el OK.
- Si algo es ambiguo, primero 1 o 2 preguntas cortas.
- Al terminar cada paso: qué se logró, cómo probarlo y cuál es el siguiente paso.
- Explicaciones en español simple, con instrucciones exactas para lo que se hace fuera del código (Supabase, Vercel, GitHub, Google).

**Pasos típicos de un cambio:**
1. Si hay SQL: pegar la migración nueva en Supabase → SQL Editor → Run.
2. Probar en `localhost:3000` (con personas de prueba como `prueba1@thehouse.cl`, que no necesitan existir).
3. Guardar una versión (commit), subir la rama y unir el pull request a `main`. Vercel publica en 1 o 2 minutos.

---

## 10. Problemas frecuentes

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| Un cambio no aparece en la app del equipo | Está en una rama, no en `main` | Unir el pull request en GitHub |
| La página se cae después de un cambio | Falta pegar la migración en Supabase | Correr el SQL nuevo en el SQL Editor |
| Alguien no puede entrar | No está en Personas, fue dado de baja o su correo no es @thehouse.cl | Revisar Personas. Si olvidó la clave y no le llega el correo: el admin borra su usuario en Supabase → Authentication → Users y la persona vuelve a "Crear mi contraseña" |
| Un puesto no entró a la rotación | Su liberación es "para todos" o termina antes del fin del turno | Cambiar la etiqueta en Programado a "Para rotación" o alargar la liberación |
| "Esa persona ya tiene un estacionamiento ese día" | Ya tiene otro puesto, préstamo o reserva | Revisar sus préstamos o usar una cuenta con varios puestos |
| El recordatorio no llegó | Activador borrado, error del script o spam | Apps Script → Activadores / Ejecuciones; revisar la carpeta de spam |

---

## 11. Pendientes e ideas

- **Correo cuando a alguien le toca la rotación** (hoy el aviso es solo dentro de la app).
- **Regla del 50%:** si alguien devuelve la rotación antes y usó menos de la mitad de los días, vuelve al primer lugar de la lista. Hoy se decide a mano con ✎.
- **Feriados** de 2028 en adelante.
- **"Modo app"** (ícono con logo y pantalla completa al instalarla en el teléfono) y después **notificaciones push**.
- Instructivo para **iPhone** (ya existe el de Android).
- Respaldo mensual de las tablas principales (el plan gratis de Supabase no guarda copias automáticas).
- Fuera del alcance por ahora: reportes y gestión de visitas.
