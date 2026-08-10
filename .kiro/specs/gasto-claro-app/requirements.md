# Requirements Document

## Introduction

Lunumia es una aplicación local-first de presupuestos personales que permite organizar ingresos, distribuir dinero entre categorías, registrar gastos, controlar pagos recurrentes y calcular cuánto dinero puede gastar realmente el usuario sin afectar sus compromisos. La aplicación se construye como PWA y posteriormente se empaqueta como aplicación Android mediante Capacitor.

El proyecto se desarrolla en seis fases secuenciales con dependencias explícitas entre ellas.

## Glossary

- **App**: La aplicación Lunumia en su conjunto.
- **Periodo**: Intervalo temporal (mensual o quincenal) que agrupa ingresos, gastos y presupuestos.
- **Periodo_Activo**: El único periodo seleccionado por el usuario como contexto actual para operaciones y visualización.
- **Ingreso**: Entrada de dinero registrada por el usuario dentro de un periodo.
- **Gasto**: Salida de dinero registrada por el usuario dentro de un periodo.
- **Categoria**: Agrupación personalizada para clasificar gastos y asignar presupuestos.
- **Presupuesto_Categoria**: Monto asignado a una categoría dentro de un periodo.
- **Pago_Recurrente**: Compromiso de gasto que se repite periódicamente.
- **Pago_Recurrente_Ocurrencia**: Instancia individual de un Pago_Recurrente generada para un periodo específico según la frecuencia configurada; contiene dueDate (DateOnly), status (pending, paid, skipped) y transactionId opcional que vincula al gasto creado.
- **Saldo_Actual**: Suma de ingresos menos suma de gastos en un periodo.
- **Presupuesto_Restante**: Diferencia entre el presupuesto asignado y los gastos realizados en una categoría.
- **Compromisos_Pendientes**: Suma de los montos de las Pago_Recurrente_Ocurrencia con status pending cuyo dueDate pertenece al Periodo_Activo.
- **Dinero_Disponible_Real**: Saldo actual menos compromisos pendientes.
- **Ritmo_De_Gasto**: Indicador que compara el gasto acumulado con el avance temporal del periodo.
- **Simulador**: Funcionalidad que permite evaluar el impacto de una compra hipotética sobre el dinero disponible real.
- **Dashboard**: Pantalla principal que muestra resúmenes financieros del periodo activo.
- **Repositorio_Local**: Capa de acceso a datos que opera sobre IndexedDB mediante Dexie.
- **Repositorio_Remoto**: Capa de acceso a datos que opera sobre Supabase PostgreSQL.
- **Cola_De_Sincronizacion**: Estructura que almacena cambios pendientes de enviar a Supabase.
- **Estado_Sincronizacion**: Indicador por registro con valores synced, pending o error.
- **OperationId**: Identificador UUID único asignado a cada operación encolada en la Cola_De_Sincronizacion para garantizar idempotencia en reintentos.
- **Funcion_Backend**: Función serverless segura que ejecuta operaciones de OCR, IA o eliminación de cuenta.
- **Recibo**: Imagen de un comprobante de pago del que se extraen datos.
- **Motor_OCR**: Servicio externo que extrae texto de imágenes de recibos.
- **Motor_IA**: Servicio externo que genera sugerencias y resúmenes financieros.
- **Centavos**: Unidad de almacenamiento monetario; todos los importes se guardan como enteros.
- **DateOnly**: Formato YYYY-MM-DD utilizado para fechas de movimientos, periodos, recibos y vencimientos.
- **Instant**: Formato UTC YYYY-MM-DDTHH:mm:ss.sssZ utilizado para createdAt, updatedAt, deletedAt y eventos de sincronización.
- **PWA**: Progressive Web App instalable con soporte offline.
- **RLS**: Row Level Security de PostgreSQL que aísla datos por usuario.
- **SchemaVersion**: Identificador de versión incluido en archivos de respaldo para permitir migraciones futuras.

## Requirements

### Dependencias entre fases

| Fase                              | Depende de                      |
| --------------------------------- | ------------------------------- |
| Fase 1: PWA local                 | Ninguna                         |
| Fase 2: Autenticación y nube      | Fase 1                          |
| Fase 3: Sincronización            | Fase 1 y Fase 2                 |
| Fase 4: Reconocimiento de recibos | Fase 1 y Fase 2                 |
| Fase 5: Inteligencia artificial   | Fase 1 y Fase 2                 |
| Fase 6: Android                   | Fase 1, Fase 2, Fase 3 y Fase 4 |

**Nota sobre Fase 4:** Depende de Fase 1 y Fase 2 porque el procesamiento de recibos utiliza una Funcion_Backend autenticada.

**Nota sobre Fase 5:** No es obligatoria para generar el APK de Fase 6; solo es requisito para utilizar las funciones de IA dentro de la aplicación Android.

### Restricciones globales

- No implementar conexión bancaria.
- No implementar pagos reales.
- No implementar presupuestos compartidos.
- No implementar conversión entre monedas.
- No implementar aplicación iOS.
- No implementar notificaciones push remotas.
- No implementar un panel administrativo.
- No añadir características fuera del alcance definido.
- No guardar secretos ni claves privadas en el frontend.
- No seleccionar todavía un proveedor definitivo de OCR o IA.
- No implementar CRDT ni edición colaborativa.

### Requirement 1: Gestión de periodos

**User Story:** Como usuario, quiero crear periodos mensuales o quincenales, para organizar mis finanzas en intervalos definidos.

#### Acceptance Criteria

1. WHEN el usuario selecciona crear un periodo, THE App SHALL presentar opciones para tipo mensual o quincenal con fecha de inicio y fecha de fin.
2. WHEN el usuario confirma la creación de un periodo, THE App SHALL almacenar el periodo en el Repositorio_Local con un identificador UUID, tipo, fecha de inicio y fecha de fin en formato DateOnly.
3. IF el usuario intenta crear un periodo cuyas fechas se solapan con un periodo existente, THEN THE App SHALL mostrar un mensaje de error indicando el conflicto y rechazar la creación.
4. THE App SHALL permitir al usuario visualizar la lista de periodos ordenados por fecha de inicio descendente.
5. THE App SHALL definir un único Periodo_Activo en todo momento; por defecto el periodo cuyo rango de fechas contiene la fecha actual.
6. IF no existe un periodo que contenga la fecha actual, THEN THE App SHALL mostrar un estado de creación invitando al usuario a crear un nuevo periodo.
7. THE App SHALL permitir al usuario seleccionar manualmente cualquier periodo como Periodo_Activo.

### Requirement 2: Registro de ingresos

**User Story:** Como usuario, quiero registrar ingresos dentro de un periodo, para conocer el dinero que entra.

#### Acceptance Criteria

1. WHEN el usuario registra un ingreso, THE App SHALL almacenar el monto en Centavos, la descripción, la fecha en DateOnly y el identificador del periodo asociado.
2. THE App SHALL validar que el monto del ingreso sea un entero positivo mayor que cero.
3. IF el usuario envía un formulario de ingreso con campos obligatorios vacíos, THEN THE App SHALL mostrar mensajes de validación específicos por campo.
4. THE App SHALL permitir al usuario editar y eliminar ingresos registrados.

### Requirement 3: Registro de gastos

**User Story:** Como usuario, quiero registrar gastos dentro de un periodo y asignarlos a una categoría, para saber en qué gasto mi dinero.

#### Acceptance Criteria

1. WHEN el usuario registra un gasto, THE App SHALL almacenar el monto en Centavos, la descripción, la fecha en DateOnly, la Categoria asociada y el identificador del periodo.
2. THE App SHALL validar que el monto del gasto sea un entero positivo mayor que cero.
3. IF el usuario envía un formulario de gasto con campos obligatorios vacíos, THEN THE App SHALL mostrar mensajes de validación específicos por campo.
4. THE App SHALL permitir al usuario editar y eliminar gastos registrados.

### Requirement 4: Categorías personalizadas

**User Story:** Como usuario, quiero crear, editar y eliminar categorías personalizadas, para clasificar mis gastos según mis necesidades.

#### Acceptance Criteria

1. WHEN el usuario crea una categoría, THE App SHALL almacenar el nombre, un color identificador y un ícono opcional en el Repositorio_Local.
2. THE App SHALL validar que el nombre de la categoría sea único dentro del usuario, normalizando la comparación al ignorar espacios exteriores y diferencias entre mayúsculas y minúsculas.
3. IF el usuario intenta eliminar una categoría que tiene gastos asociados, THEN THE App SHALL solicitar confirmación e indicar la cantidad de gastos que quedarán sin categoría.
4. THE App SHALL permitir al usuario editar el nombre, color e ícono de una categoría existente.

### Requirement 5: Presupuestos por categoría

**User Story:** Como usuario, quiero asignar un monto de presupuesto a cada categoría dentro de un periodo, para controlar cuánto destino a cada área.

#### Acceptance Criteria

1. WHEN el usuario asigna un presupuesto a una categoría, THE App SHALL almacenar el Presupuesto_Categoria con monto en Centavos, identificador de categoría e identificador de periodo.
2. THE App SHALL validar que el monto del presupuesto sea un entero positivo mayor o igual a cero.
3. THE App SHALL permitir al usuario modificar el presupuesto asignado a una categoría dentro de un periodo activo.
4. THE App SHALL mostrar el total de presupuesto asignado en el periodo y la suma de todos los presupuestos por categoría.

### Requirement 6: Pagos recurrentes

**User Story:** Como usuario, quiero registrar pagos recurrentes con monto, frecuencia y fecha de vencimiento, para que la aplicación considere mis compromisos fijos.

#### Acceptance Criteria

1. WHEN el usuario crea un pago recurrente, THE App SHALL almacenar el nombre, monto en Centavos, frecuencia (semanal, quincenal, mensual), fecha de vencimiento en DateOnly, Categoria asociada y estado (activo o inactivo).
2. WHEN un periodo está activo, THE App SHALL generar una o más Pago_Recurrente_Ocurrencia para cada pago recurrente activo según su frecuencia y las fechas del periodo.
3. WHEN el usuario marca una ocurrencia como pagada, THE App SHALL crear exactamente un gasto vinculado y establecer el status de la ocurrencia a paid de forma atómica en una única transacción de IndexedDB.
4. THE App SHALL impedir que se cree más de un gasto para la misma Pago_Recurrente_Ocurrencia.
5. THE App SHALL permitir al usuario activar, desactivar, editar y eliminar pagos recurrentes.
6. THE App SHALL permitir al usuario marcar una ocurrencia como skipped.
7. WHILE un periodo está activo, THE App SHALL calcular los Compromisos_Pendientes como la suma de los montos de las Pago_Recurrente_Ocurrencia con status pending cuyo dueDate pertenece al Periodo_Activo.

### Requirement 7: Cálculos financieros

**User Story:** Como usuario, quiero ver mi saldo actual, presupuesto restante, compromisos pendientes y dinero disponible real, para tomar decisiones informadas.

#### Acceptance Criteria

1. THE App SHALL calcular el Saldo_Actual como la suma de ingresos menos la suma de gastos del Periodo_Activo.
2. THE App SHALL calcular el Presupuesto_Restante por categoría como el Presupuesto_Categoria menos la suma de gastos de esa categoría en el periodo.
3. THE App SHALL calcular los Compromisos_Pendientes como la suma de los montos de las Pago_Recurrente_Ocurrencia con status pending cuyo dueDate pertenece al Periodo_Activo.
4. THE App SHALL calcular el Dinero_Disponible_Real como Saldo_Actual menos Compromisos_Pendientes.
5. THE App SHALL almacenar todos los importes como enteros en Centavos y realizar operaciones aritméticas exclusivamente con enteros.
6. FOR ALL cálculos financieros, computar el resultado a partir de los datos de entrada y luego verificar que recomputar produce un valor idéntico (propiedad de determinismo).

### Requirement 8: Ritmo de gasto

**User Story:** Como usuario, quiero ver un indicador de ritmo de gasto, para saber si estoy gastando más rápido de lo esperado.

#### Acceptance Criteria

1. WHILE un periodo está activo, THE App SHALL calcular el Ritmo_De_Gasto comparando el porcentaje de presupuesto gastado con el porcentaje de tiempo transcurrido del periodo.
2. IF el presupuesto total del periodo es cero, THEN THE App SHALL mostrar el Ritmo_De_Gasto como indeterminado sin realizar división entre cero.
3. THE App SHALL limitar el porcentaje de tiempo transcurrido del periodo entre 0 y 100.
4. THE App SHALL mostrar el Ritmo_De_Gasto con un indicador visual que distinga entre ritmo bajo, adecuado y alto.
5. IF el porcentaje de gasto supera el porcentaje de tiempo transcurrido en más de 10 puntos, THEN THE App SHALL mostrar una alerta visual de ritmo alto.

### Requirement 9: Simulador de compras

**User Story:** Como usuario, quiero simular una compra antes de realizarla, para ver cómo impactaría mi dinero disponible real.

#### Acceptance Criteria

1. WHEN el usuario ingresa un monto en el Simulador, THE App SHALL mostrar el Dinero_Disponible_Real resultante tras restar el monto simulado.
2. THE App SHALL mostrar el impacto del gasto simulado en el Presupuesto_Restante de la categoría seleccionada.
3. THE App SHALL indicar visualmente si la compra simulada dejaría el Dinero_Disponible_Real en valor negativo.
4. THE App SHALL permitir al usuario convertir la simulación en un gasto real con un solo paso de confirmación.

### Requirement 10: Dashboard responsive

**User Story:** Como usuario, quiero una pantalla principal que resuma mis finanzas del periodo activo, para tener una visión general rápida.

#### Acceptance Criteria

1. THE Dashboard SHALL mostrar Saldo_Actual, Presupuesto_Restante total, Compromisos_Pendientes y Dinero_Disponible_Real del Periodo_Activo.
2. THE Dashboard SHALL mostrar el Ritmo_De_Gasto del Periodo_Activo.
3. THE Dashboard SHALL adaptar su diseño para pantallas móviles (mínimo 320px de ancho) y de escritorio (hasta 1440px).
4. THE Dashboard SHALL cumplir con un nivel mínimo de contraste WCAG AA para todos los textos e indicadores.
5. THE Dashboard SHALL mostrar estados de carga y vacío cuando no existan datos.

### Requirement 11: Persistencia local

**User Story:** Como usuario, quiero que mis datos se guarden localmente en el dispositivo, para no depender de conexión a internet.

#### Acceptance Criteria

1. THE Repositorio_Local SHALL almacenar todos los datos del usuario en IndexedDB mediante Dexie.
2. THE App SHALL permitir que las funciones principales de presupuesto (periodos, ingresos, gastos, categorías, presupuestos, pagos recurrentes, cálculos, simulador) funcionen completamente offline.
3. WHEN el usuario crea, edita o elimina un registro, THE Repositorio_Local SHALL persistir el cambio de forma inmediata en IndexedDB.
4. FOR ALL registros, almacenar y luego recuperar un registro SHALL producir un objeto equivalente al original (propiedad round-trip).
5. THE App SHALL requerir conexión a internet para funciones de OCR, IA, autenticación y sincronización.

### Requirement 12: Exportar e importar respaldos

**User Story:** Como usuario, quiero exportar e importar mis datos en un archivo, para tener un respaldo manual.

#### Acceptance Criteria

1. WHEN el usuario solicita una exportación, THE App SHALL generar un archivo JSON que contenga todos los periodos, ingresos, gastos, categorías, presupuestos y pagos recurrentes del usuario, incluyendo un campo SchemaVersion.
2. WHEN el usuario importa un archivo de respaldo, THE App SHALL validar la estructura del archivo con Zod antes de procesar los datos.
3. IF el archivo importado no cumple el esquema de validación, THEN THE App SHALL mostrar un mensaje de error descriptivo y rechazar la importación.
4. WHEN la importación es válida, THE App SHALL solicitar confirmación al usuario indicando que los datos actuales serán reemplazados.
5. FOR ALL datos exportados, importar el archivo exportado SHALL producir un estado de datos equivalente al original (propiedad round-trip).

### Requirement 13: Instalación como PWA

**User Story:** Como usuario, quiero instalar la aplicación en mi dispositivo como una PWA, para acceder rápidamente desde la pantalla de inicio.

#### Acceptance Criteria

1. THE App SHALL incluir un manifiesto web válido con nombre, íconos en múltiples resoluciones y configuración de display standalone.
2. THE App SHALL registrar un service worker que almacene en caché los recursos estáticos para funcionamiento offline.
3. WHEN el navegador detecta que la aplicación es instalable, THE App SHALL mostrar un indicador o botón de instalación.
4. WHILE la aplicación funciona sin conexión, THE App SHALL mostrar un indicador de estado offline.

### Requirement 14: Lógica financiera independiente

**User Story:** Como desarrollador, quiero que la lógica financiera esté separada de React, para facilitar pruebas y reutilización.

#### Acceptance Criteria

1. THE App SHALL implementar todos los cálculos financieros en módulos TypeScript puros sin dependencias de React.
2. THE App SHALL validar todas las entradas de datos financieros con esquemas Zod.
3. THE App SHALL cubrir todos los cálculos financieros con pruebas unitarias en Vitest.

### Requirement 15: Registro de usuario

**User Story:** Como usuario nuevo, quiero registrarme con correo y contraseña, para tener una cuenta personal.

#### Acceptance Criteria

1. WHEN el usuario completa el formulario de registro con correo y contraseña válidos, THE App SHALL crear la cuenta mediante Supabase Auth.
2. THE App SHALL validar que el correo tenga formato válido y la contraseña cumpla un mínimo de 8 caracteres.
3. IF el correo ya está registrado, THEN THE App SHALL mostrar un mensaje de error indicando que la cuenta ya existe.
4. IF Supabase Auth requiere verificación de correo electrónico, THEN THE App SHALL mostrar una pantalla indicando que el usuario debe confirmar su dirección de correo antes de continuar.
5. WHEN el registro es exitoso y la configuración de Supabase permite inicio de sesión inmediato, THE App SHALL iniciar sesión automáticamente y redirigir al Dashboard.

### Requirement 16: Inicio y cierre de sesión

**User Story:** Como usuario registrado, quiero iniciar y cerrar sesión, para acceder a mis datos de forma segura.

#### Acceptance Criteria

1. WHEN el usuario ingresa credenciales válidas, THE App SHALL autenticar al usuario mediante Supabase Auth y redirigir al Dashboard.
2. IF las credenciales son inválidas, THEN THE App SHALL mostrar un mensaje de error genérico sin revelar si el correo existe.
3. WHEN el usuario solicita cerrar sesión, THE App SHALL finalizar la sesión en Supabase Auth y redirigir a la pantalla de inicio de sesión.
4. WHILE no existe sesión activa, THE App SHALL restringir el acceso a las pantallas protegidas y redirigir al inicio de sesión.
5. THE App SHALL permitir acceso offline únicamente a usuarios que ya tengan una sesión válida almacenada localmente y datos locales existentes.
6. WHEN un usuario intenta iniciar sesión por primera vez en un dispositivo, THE App SHALL requerir conexión a internet.
7. WHILE existen cambios sin sincronizar en la Cola_De_Sincronizacion, THE App SHALL advertir al usuario antes de cerrar sesión indicando la cantidad de cambios pendientes.

### Requirement 17: Recuperación de contraseña

**User Story:** Como usuario, quiero recuperar mi contraseña si la olvido, para no perder acceso a mi cuenta.

#### Acceptance Criteria

1. WHEN el usuario solicita recuperación de contraseña con un correo válido, THE App SHALL enviar un enlace de restablecimiento mediante Supabase Auth.
2. THE App SHALL mostrar un mensaje de confirmación indicando que el enlace fue enviado, independientemente de si el correo está registrado.
3. WHEN el usuario accede al enlace de restablecimiento, THE App SHALL mostrar un formulario para ingresar la nueva contraseña.

### Requirement 18: Persistencia remota

**User Story:** Como usuario autenticado, quiero que mis datos se almacenen en la nube, para acceder desde cualquier dispositivo.

#### Acceptance Criteria

1. WHEN el usuario está autenticado, THE Repositorio_Remoto SHALL almacenar los datos en Supabase PostgreSQL asociados al identificador del usuario.
2. THE Repositorio_Remoto SHALL aplicar Row Level Security en todas las tablas para que cada usuario acceda exclusivamente a sus propios datos.
3. IF una operación remota falla por error de red, THEN THE App SHALL mostrar un mensaje de error y mantener los datos locales intactos.

### Requirement 19: Row Level Security

**User Story:** Como usuario, quiero que mis datos estén aislados de otros usuarios, para garantizar mi privacidad.

#### Acceptance Criteria

1. THE Repositorio_Remoto SHALL configurar políticas RLS en todas las tablas que contengan datos de usuario.
2. THE Repositorio_Remoto SHALL rechazar cualquier consulta que intente acceder a datos de un usuario diferente al autenticado.
3. THE Repositorio_Remoto SHALL asociar cada registro con el user_id del usuario autenticado en el momento de la inserción.

### Requirement 20: Eliminación de cuenta

**User Story:** Como usuario, quiero poder eliminar mi cuenta y todos mis datos asociados, para ejercer mi derecho a la eliminación de datos.

#### Acceptance Criteria

1. WHEN el usuario solicita eliminar su cuenta, THE App SHALL mostrar una confirmación explícita indicando que la acción es irreversible.
2. WHEN el usuario confirma la eliminación, THE App SHALL invocar una Funcion_Backend segura que valide la identidad del usuario antes de proceder.
3. THE Funcion_Backend SHALL eliminar todos los datos del usuario en Supabase PostgreSQL y posteriormente eliminar la identidad en Supabase Auth.
4. THE Funcion_Backend SHALL mantener las credenciales administrativas exclusivamente en el servidor, sin exponerlas al frontend.
5. WHEN la eliminación es exitosa, THE App SHALL borrar los datos locales del Repositorio_Local y redirigir a la pantalla de inicio.

### Requirement 21: Copia local persistente

**User Story:** Como usuario autenticado, quiero mantener una copia local de mis datos, para trabajar sin conexión y sincronizar después.

#### Acceptance Criteria

1. WHILE el usuario está autenticado, THE App SHALL mantener una copia completa de los datos del usuario en el Repositorio_Local.
2. WHEN el usuario inicia sesión por primera vez en un dispositivo, THE App SHALL descargar los datos remotos y almacenarlos en el Repositorio_Local.
3. THE App SHALL usar el Repositorio_Local como fuente primaria de datos para la interfaz de usuario.

### Requirement 22: Operaciones offline

**User Story:** Como usuario, quiero crear, editar y eliminar datos sin conexión, para no interrumpir mi flujo de trabajo.

#### Acceptance Criteria

1. WHILE la aplicación no tiene conexión a internet, THE App SHALL permitir crear, editar y eliminar registros en el Repositorio_Local.
2. WHEN el usuario realiza un cambio sin conexión, THE App SHALL agregar la operación a la Cola_De_Sincronizacion con un OperationId único, timestamp Instant y tipo de operación.
3. THE App SHALL preservar el orden de las operaciones en la Cola_De_Sincronizacion según su timestamp de creación.
4. THE App SHALL guardar el cambio local y su operación de cola dentro de una única transacción de IndexedDB para garantizar atomicidad.

### Requirement 23: Sincronización con Supabase

**User Story:** Como usuario, quiero que mis cambios locales se sincronicen con la nube cuando recupere la conexión, para mantener mis datos actualizados en todos los dispositivos.

#### Acceptance Criteria

1. WHEN la conexión se restablece, THE App SHALL procesar la Cola_De_Sincronizacion enviando los cambios pendientes al Repositorio_Remoto en orden cronológico.
2. WHEN un cambio se sincroniza exitosamente, THE App SHALL actualizar el Estado_Sincronizacion del registro a synced y eliminarlo de la Cola_De_Sincronizacion.
3. IF un cambio falla al sincronizarse, THEN THE App SHALL marcar el Estado_Sincronizacion como error y mantener el cambio en la Cola_De_Sincronizacion para reintento.
4. THE App SHALL usar la estrategia last-write-wins para resolver conflictos, donde el registro con timestamp más reciente prevalece. Esta estrategia es una limitación consciente del MVP que puede generar pérdida de datos en ediciones concurrentes simultáneas.
5. THE App SHALL utilizar el OperationId de cada operación para garantizar que reintentar una operación no produzca duplicados en el Repositorio_Remoto.
6. THE App SHALL utilizar un campo deletedAt (Instant) como tombstone para eliminaciones, evitando que registros eliminados reaparezcan tras sincronización.

### Requirement 23B: Sincronización bidireccional

**User Story:** Como usuario, quiero que los cambios realizados en otros dispositivos se descarguen a mi dispositivo actual, para tener siempre la información más reciente.

#### Acceptance Criteria

1. WHEN el usuario inicia la aplicación con conexión activa, THE App SHALL descargar los cambios remotos más recientes desde el Repositorio_Remoto.
2. WHEN la aplicación recupera conexión a internet, THE App SHALL descargar los cambios remotos antes de procesar la cola local.
3. WHEN la Cola_De_Sincronizacion se procesa exitosamente, THE App SHALL descargar los cambios remotos posteriores para consolidar el estado.
4. THE App SHALL permitir al usuario activar una sincronización manual desde la interfaz.
5. THE App SHALL respetar el campo deletedAt como tombstone para no restaurar localmente registros que fueron eliminados en otro dispositivo.
6. THE App SHALL no modificar el día de un movimiento (DateOnly) debido a conversiones de zona horaria durante la sincronización.

### Requirement 24: Indicadores de estado de sincronización

**User Story:** Como usuario, quiero ver el estado de sincronización de mis datos, para saber si hay cambios pendientes o errores.

#### Acceptance Criteria

1. THE App SHALL mostrar un indicador global de Estado_Sincronizacion con valores synced, pending o error.
2. WHILE existen cambios en la Cola_De_Sincronizacion, THE App SHALL mostrar el estado pending con la cantidad de cambios pendientes.
3. IF algún cambio tiene Estado_Sincronizacion error, THEN THE App SHALL mostrar un indicador de error con opción de reintentar.
4. THE App SHALL mostrar un indicador cuando la aplicación detecte que no tiene conexión a internet.

### Requirement 24B: Migración de datos locales

**User Story:** Como usuario, quiero que mis datos locales se manejen correctamente al registrarme o iniciar sesión, para no perder información ni mezclar datos de otros usuarios.

#### Acceptance Criteria

1. WHEN un usuario se registra con una cuenta nueva y existen datos locales, THE App SHALL ofrecer la opción de migrar los datos locales a la cuenta recién creada.
2. WHEN el usuario acepta migrar datos locales, THE App SHALL solicitar confirmación explícita antes de ejecutar la migración.
3. THE App SHALL no mezclar automáticamente datos locales con una cuenta existente que ya contenga datos remotos.
4. IF existen datos locales y datos remotos al iniciar sesión en una cuenta existente, THEN THE App SHALL presentar una decisión explícita al usuario (conservar remotos, conservar locales, o descartar locales).
5. WHEN un usuario cierra sesión, THE App SHALL eliminar los datos locales del Repositorio_Local para impedir que queden accesibles al siguiente usuario del dispositivo.
6. WHILE existen cambios sin sincronizar en la Cola_De_Sincronizacion, THE App SHALL advertir al usuario antes de cerrar sesión indicando la cantidad de cambios pendientes.

### Requirement 25: Captura de imagen

**User Story:** Como usuario, quiero capturar o seleccionar una imagen de un recibo, para registrar el gasto automáticamente.

#### Acceptance Criteria

1. THE App SHALL permitir al usuario capturar una foto con la cámara del dispositivo o seleccionar una imagen de la galería.
2. WHEN el usuario selecciona o captura una imagen, THE App SHALL comprimir la imagen antes de enviarla para reducir el tiempo de procesamiento.
3. THE App SHALL mostrar una vista previa de la imagen seleccionada antes de enviarla al procesamiento.

### Requirement 26: Extracción de datos del recibo

**User Story:** Como usuario, quiero que la aplicación extraiga automáticamente los datos del recibo, para no tener que escribirlos manualmente.

#### Acceptance Criteria

1. WHEN el usuario confirma el envío de la imagen, THE App SHALL enviar la imagen comprimida a la Funcion_Backend para procesamiento con el Motor_OCR.
2. WHEN el Motor_OCR devuelve resultados, THE App SHALL extraer comercio, fecha (DateOnly), total y moneda del recibo.
3. THE App SHALL validar la respuesta del Motor_OCR con un esquema Zod antes de mostrar los resultados.
4. IF el Motor_OCR no puede extraer algún campo, THEN THE App SHALL dejar el campo vacío en el formulario para que el usuario lo complete manualmente.
5. IF la Funcion_Backend falla o no responde, THEN THE App SHALL mostrar un mensaje de error y ofrecer la opción de ingresar los datos manualmente.
6. IF la moneda detectada por el Motor_OCR no coincide con la moneda configurada por el usuario, THEN THE App SHALL solicitar revisión manual antes de crear el movimiento.

### Requirement 27: Confirmación y creación del movimiento

**User Story:** Como usuario, quiero revisar y corregir los datos extraídos antes de registrar el gasto, para asegurar la exactitud.

#### Acceptance Criteria

1. WHEN los datos del recibo son extraídos, THE App SHALL mostrar un formulario editable con los campos comercio, fecha, total, moneda y categoría.
2. THE App SHALL exigir confirmación explícita del usuario antes de crear el movimiento de gasto.
3. WHEN el usuario confirma el movimiento, THE App SHALL crear el gasto con los datos validados en el Repositorio_Local.
4. WHEN el movimiento se crea exitosamente, THE App SHALL eliminar la imagen del recibo tanto en frontend como en backend sin almacenarla permanentemente.

### Requirement 28: Sugerencia de categorías

**User Story:** Como usuario, quiero que la aplicación sugiera una categoría para mis movimientos, para agilizar la clasificación.

#### Acceptance Criteria

1. WHEN el usuario crea un gasto, THE App SHALL enviar la descripción a la Funcion_Backend para obtener una sugerencia de categoría del Motor_IA.
2. THE App SHALL mostrar la categoría sugerida como preselección en el formulario, sin aplicarla automáticamente.
3. THE App SHALL validar la respuesta del Motor_IA con un esquema Zod para asegurar que la categoría sugerida existe en las categorías del usuario.
4. IF la Funcion_Backend no responde o la sugerencia es inválida, THEN THE App SHALL permitir al usuario seleccionar la categoría manualmente sin bloquear el flujo.

### Requirement 29: Resumen mensual

**User Story:** Como usuario, quiero ver un resumen breve generado por IA al final del periodo, para entender mis hábitos de gasto.

#### Acceptance Criteria

1. WHEN el usuario solicita un resumen del periodo, THE App SHALL enviar los datos agregados del periodo a la Funcion_Backend.
2. THE App SHALL mostrar un resumen textual breve generado por el Motor_IA con los puntos principales del periodo.
3. THE App SHALL validar la estructura de la respuesta del Motor_IA con un esquema Zod.
4. IF la generación del resumen falla, THEN THE App SHALL mostrar un mensaje indicando que el resumen no está disponible.

### Requirement 30: Detección de aumentos por categoría

**User Story:** Como usuario, quiero que la aplicación identifique aumentos relevantes en mis categorías de gasto, para estar al tanto de cambios en mis hábitos.

#### Acceptance Criteria

1. WHEN el usuario consulta los insights del periodo, THE App SHALL calcular los importes y porcentajes de cambio por categoría mediante funciones TypeScript puras.
2. THE App SHALL enviar los resultados calculados a la Funcion_Backend para que el Motor_IA genere una explicación textual de los cambios detectados.
3. THE App SHALL no depender exclusivamente de una respuesta generativa del Motor_IA para cifras financieras mostradas al usuario; los importes y porcentajes se obtienen de las funciones TypeScript.
4. THE App SHALL validar la respuesta del Motor_IA con un esquema Zod antes de presentar los datos.
5. THE App SHALL presentar los insights como información de solo lectura, sin realizar modificaciones automáticas a los datos del usuario.

### Requirement 31: Seguridad en operaciones de IA

**User Story:** Como desarrollador, quiero que todas las solicitudes de IA se ejecuten mediante funciones seguras del backend, para proteger claves y datos.

#### Acceptance Criteria

1. THE App SHALL ejecutar todas las solicitudes al Motor_IA y Motor_OCR exclusivamente a través de la Funcion_Backend.
2. THE App SHALL enviar el token de autenticación del usuario en cada solicitud a la Funcion_Backend.
3. THE Funcion_Backend SHALL almacenar las claves de API de servicios externos en variables de entorno del servidor, sin exponerlas al frontend.
4. THE App SHALL validar con Zod todas las respuestas recibidas de la Funcion_Backend antes de procesarlas.
5. THE App SHALL respetar la regla de no permitir modificaciones automáticas sin confirmación del usuario.

### Requirement 32: Integración con Capacitor

**User Story:** Como usuario, quiero usar Lunumia como aplicación nativa en Android, para una experiencia optimizada en mi teléfono.

#### Acceptance Criteria

1. THE App SHALL integrar Capacitor como capa nativa para empaquetar la PWA como aplicación Android.
2. THE App SHALL generar un proyecto Android funcional mediante Capacitor.
3. THE App SHALL mantener toda la funcionalidad de autenticación, almacenamiento local y sincronización dentro de la aplicación Android.
4. THE App SHALL generar un APK instalable para distribución directa.

### Requirement 33: Acceso a cámara nativa

**User Story:** Como usuario Android, quiero usar la cámara nativa para fotografiar recibos, para una experiencia integrada.

#### Acceptance Criteria

1. WHEN el usuario activa la captura de recibo en Android, THE App SHALL acceder a la cámara nativa del dispositivo mediante los plugins de Capacitor.
2. THE App SHALL solicitar permisos de cámara al usuario antes del primer uso.
3. IF el usuario deniega el permiso de cámara, THEN THE App SHALL mostrar un mensaje explicativo y ofrecer la alternativa de seleccionar una imagen de la galería.
4. THE App SHALL mantener el mismo flujo de procesamiento de recibos definido en la Fase 4.

### Requirement 34: Restricciones de plataforma

**User Story:** Como equipo de desarrollo, queremos definir las limitaciones de la versión Android para acotar el alcance.

#### Acceptance Criteria

1. THE App SHALL soportar Android como única plataforma móvil nativa.
2. THE App SHALL generar únicamente un APK para distribución directa, sin publicación en Google Play en esta fase.
3. THE App SHALL mantener compatibilidad con la versión PWA, compartiendo la misma base de código para la lógica de negocio.

### Requirement 35: Diseño responsive y accesible

**User Story:** Como usuario, quiero que la aplicación sea usable en cualquier dispositivo y accesible, para no tener barreras de uso.

#### Acceptance Criteria

1. THE App SHALL adaptar su interfaz para anchos de pantalla desde 320px hasta 1440px.
2. THE App SHALL cumplir contraste mínimo WCAG AA en todos los elementos de texto.
3. THE App SHALL ser navegable completamente mediante teclado.
4. THE App SHALL incluir atributos ARIA apropiados en componentes interactivos.

### Requirement 36: Arquitectura modular

**User Story:** Como desarrollador, quiero una arquitectura modular separada por funcionalidades, para facilitar el mantenimiento y las pruebas.

#### Acceptance Criteria

1. THE App SHALL organizar el código en módulos separados para dominio, persistencia, sincronización e interfaz.
2. THE App SHALL implementar repositorios separados para el Repositorio_Local y el Repositorio_Remoto.
3. THE App SHALL mantener la lógica financiera en módulos TypeScript puros sin dependencias de framework.
4. THE App SHALL validar todas las entradas y respuestas externas con esquemas Zod.

### Requirement 37: Manejo de estados de interfaz

**User Story:** Como usuario, quiero ver estados claros de carga, vacío, error y offline, para entender qué está pasando en todo momento.

#### Acceptance Criteria

1. THE App SHALL mostrar un indicador de carga durante operaciones asíncronas.
2. THE App SHALL mostrar un estado vacío descriptivo cuando no existan datos para mostrar.
3. IF una operación falla, THEN THE App SHALL mostrar un mensaje de error contextual con opción de reintentar.
4. WHILE la aplicación no tiene conexión, THE App SHALL mostrar un indicador persistente de estado offline.
5. WHILE existen cambios pendientes de sincronización, THE App SHALL mostrar el Estado_Sincronizacion correspondiente.

### Requirement 38: Pruebas y calidad de código

**User Story:** Como desarrollador, quiero una suite de pruebas completa y scripts funcionales, para asegurar la calidad del código.

#### Acceptance Criteria

1. THE App SHALL incluir pruebas unitarias para todos los cálculos financieros usando Vitest.
2. THE App SHALL incluir pruebas para las operaciones de persistencia del Repositorio_Local.
3. THE App SHALL incluir pruebas para la lógica de sincronización y manejo de la Cola_De_Sincronizacion.
4. THE App SHALL proveer scripts funcionales para ejecutar pruebas, lint y build.
5. THE App SHALL validar tipos estáticamente mediante TypeScript en modo strict.
6. THE App SHALL utilizar Node.js >=22.0.0 <23.0.0 como entorno de desarrollo y validación, requerido por la integración actual con Capacitor 8.

### Requirement 39: Manejo de fechas

**User Story:** Como usuario, quiero que las fechas de mis movimientos se registren correctamente sin alteraciones por zona horaria, para tener un historial preciso.

#### Acceptance Criteria

1. THE App SHALL almacenar fechas de movimientos, periodos, recibos y vencimientos en formato DateOnly (YYYY-MM-DD).
2. THE App SHALL almacenar timestamps de creación (createdAt), actualización (updatedAt), eliminación (deletedAt) y eventos de sincronización en formato Instant (UTC YYYY-MM-DDTHH:mm:ss.sssZ).
3. THE App SHALL no modificar el día de un movimiento (DateOnly) debido a conversiones de zona horaria al leer, escribir o sincronizar datos.
