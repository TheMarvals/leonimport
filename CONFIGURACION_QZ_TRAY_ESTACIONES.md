# Configuración de QZ Tray en las estaciones del WMS

Esta guía explica cómo preparar cada PC para imprimir etiquetas directamente desde León Import WMS usando QZ Tray Community. No se requiere PrintNode ni una suscripción.

El WMS tiene un fallback permanente: si QZ Tray no está instalado, está cerrado o la impresora no responde, la etiqueta se abre como PDF en una pestaña para imprimirla manualmente.

## 1. Distribución recomendada

Cada estación debe tener su propia impresora instalada en el sistema operativo.

| Estación WMS | Uso | Impresora asignada en el panel |
| --- | --- | --- |
| Mesa 1 a Mesa 6 | Etiquetas de despacho de Mercado Libre | Una asignación `PACKING` por mesa |
| PC de Bodega | Etiquetas internas con SKU y código de barras | Una asignación `SKU` |

La impresión se ejecuta desde el PC que tiene abierto el WMS. QZ Tray se comunica únicamente con las impresoras instaladas en ese PC.

## 2. Requisitos de cada estación

Antes de instalar QZ Tray, verificar:

- PC con Windows, macOS o Linux y acceso al WMS.
- Navegador actualizado. Se recomienda Google Chrome o Microsoft Edge.
- Impresora conectada por USB o red e instalada con su controlador oficial.
- La impresora debe aparecer en la lista de impresoras del sistema operativo.
- El nombre de la estación debe estar definido: `Mesa 1` a `Mesa 6`, o `Bodega`.
- Papel o rollo cargado con el tamaño utilizado por esa estación.

Para Bodega, el WMS permite estos tamaños de etiqueta SKU:

- Pequeña: 50 × 25 mm.
- Mediana: 70 × 35 mm.
- Grande: 100 × 50 mm.

## 3. Instalar y probar primero la impresora

1. Instalar el controlador oficial del fabricante.
2. Conectar la impresora.
3. Abrir la configuración de impresoras del sistema operativo.
4. Imprimir una página de prueba.
5. Anotar el nombre exacto mostrado por el sistema, por ejemplo `ZDesigner ZD421-203dpi ZPL`.

QZ Tray detecta las impresoras publicadas por el sistema operativo. Si la prueba del sistema falla, debe corregirse antes de configurar el WMS.

## 4. Instalar QZ Tray Community

1. Descargar la versión estable desde [qz.io/download](https://qz.io/download/).
2. Ejecutar el instalador correspondiente al sistema operativo.
3. Mantener las opciones predeterminadas del instalador.
4. Permitir la instalación de certificados locales cuando el sistema lo solicite.
5. Iniciar QZ Tray.
6. En el icono de QZ Tray ubicado en la bandeja del sistema, activar la opción para iniciarlo automáticamente con el usuario.

QZ Tray 2.2 incluye su entorno Java, por lo que normalmente no es necesario instalar Java por separado. La documentación oficial de instalación está disponible en [Using QZ Tray](https://qz.io/docs/using-qz-tray).

### Consideración especial para Firefox

Si se utiliza Firefox, debe estar completamente cerrado durante la instalación de QZ Tray. Si QZ se instaló antes que Firefox o la conexión segura no funciona, cerrar Firefox y reinstalar QZ Tray. Chrome o Edge simplifican la puesta en marcha inicial.

## 5. Comprobar QZ Tray fuera del WMS

1. Confirmar que el icono de QZ Tray esté visible en la bandeja del sistema.
2. Abrir [demo.qz.io](https://demo.qz.io/).
3. Autorizar la conexión cuando QZ Tray muestre el diálogo de seguridad.
4. Comprobar que la demostración pueda listar la impresora local.

Si la impresora no aparece en la demostración, revisar el controlador, conexión USB/red y cola de impresión antes de continuar.

## 6. Asignar la impresora dentro del WMS

Este procedimiento debe realizarse físicamente desde el PC que se está configurando.

1. Iniciar QZ Tray y dejarlo ejecutándose.
2. Abrir el WMS e iniciar sesión como Supervisor o Administrador.
3. Entrar a `Supervisor → Impresoras`.
4. Pulsar **Detectar en este PC**.
5. Autorizar la conexión en el aviso de QZ Tray si aparece.
6. Seleccionar el uso:
   - **Etiqueta de despacho** para una mesa de Packing.
   - **Etiqueta SKU de bodega** para el puesto del bodeguero.
7. Para Packing, seleccionar la mesa correcta.
8. Para Bodega, seleccionar el tamaño físico de la etiqueta.
9. Seleccionar la impresora detectada.
10. Pulsar **Asignar impresora**.
11. Confirmar que la tarjeta indique **Detectada en este PC**.

No debe asignarse una mesa desde otro computador, aunque la impresora tenga el mismo modelo. La asignación usa el nombre exacto con el que el sistema operativo publica esa impresora.

## 7. Prueba de impresión por estación

### Mesa de Packing

1. Abrir una orden de prueba.
2. Completar el proceso de Packing.
3. Confirmar el permiso de QZ Tray si se muestra.
4. Verificar que salga una sola etiqueta de despacho por la impresora asignada.
5. Revisar orientación, escala, código de barras y márgenes.

### Puesto de Bodega

1. Entrar a Inventario con un usuario Bodeguero, Supervisor o Administrador.
2. Seleccionar un producto de prueba.
3. Solicitar una etiqueta SKU.
4. Confirmar que el código de barras, SKU y nombre sean legibles.
5. Comparar el tamaño seleccionado en el WMS con el rollo cargado.

### Prueba obligatoria del fallback

1. Cerrar QZ Tray completamente.
2. Repetir una impresión de prueba.
3. Confirmar que el WMS abra el PDF en una pestaña nueva.
4. Imprimirlo manualmente desde el navegador.
5. Volver a iniciar QZ Tray.

Si el navegador bloquea la pestaña manual, permitir ventanas emergentes para el dominio del WMS.

## 8. Funcionamiento en modo Community

QZ Tray Community permite imprimir sin pagar, pero puede mostrar advertencias o solicitudes de autorización. En la primera conexión:

1. Verificar que la solicitud provenga del dominio correcto del WMS.
2. Marcar la opción para recordar la decisión, si QZ Tray la ofrece.
3. Pulsar **Allow/Permitir**.

No se debe desactivar el antivirus, el firewall ni las validaciones del navegador para evitar estos avisos.

## 9. Impresión silenciosa con certificado propio

El WMS ya admite un certificado y una clave privada propios mediante estas variables del servidor:

```env
QZ_CERTIFICATE=""
QZ_PRIVATE_KEY=""
```

### ¿Se necesita un certificado diferente para cada estación?

No. Para este despliegue se utiliza un solo par de firma para todo el WMS:

- **Servidor:** conserva el certificado de firma y su clave privada en `QZ_CERTIFICATE` y `QZ_PRIVATE_KEY`.
- **Todas las estaciones:** reciben la misma raíz o certificado público de confianza mediante el aprovisionamiento de QZ Tray.
- **Cada instalación de QZ:** genera automáticamente su propio certificado local para la conexión segura con `localhost`. Este certificado técnico es administrado por QZ y no reemplaza el certificado con que el WMS firma los trabajos.

No se genera una clave privada del WMS por mesa. Crear pares distintos aumentaría innecesariamente el mantenimiento y no aporta aislamiento, porque todas las estaciones autorizan la misma aplicación y dominio.

Reglas de seguridad:

- `QZ_PRIVATE_KEY` se configura solamente en el servidor del WMS.
- La clave privada nunca debe copiarse a los PC, incluirse en el repositorio ni enviarse por mensajería.
- El certificado público debe corresponder exactamente a la clave usada para firmar.
- Cada instalación de QZ Tray debe confiar en la raíz propia mediante `authcert.override` o un paquete de aprovisionamiento.
- Primero debe probarse el certificado en una sola estación antes de distribuirlo al resto.

QZ documenta la instalación de una raíz propia en [Provisioning](https://qz.io/docs/provisioning). Esta etapa debe ejecutarla un administrador, porque una configuración incorrecta puede impedir que QZ valide los trabajos.

La implementación silenciosa recomendada es:

1. Generar y resguardar una autoridad certificadora interna o certificado raíz propio.
2. Configurar el certificado público en `QZ_CERTIFICATE`.
3. Configurar la clave privada correspondiente en `QZ_PRIVATE_KEY`.
4. Aprovisionar la raíz pública en QZ Tray en una estación piloto.
5. Reiniciar QZ Tray y probar detección e impresión.
6. Confirmar que no aparezca el diálogo de autorización.
7. Repetir el aprovisionamiento en las demás estaciones.

No es necesario configurar estas variables durante las primeras pruebas. Sin ellas, QZ Tray Community y el fallback manual continúan funcionando.

## 10. Diagnóstico rápido

### El WMS indica que QZ Tray no está disponible

- Confirmar que QZ Tray esté abierto y visible en la bandeja.
- Reiniciar QZ Tray y recargar el WMS.
- Probar la conexión en [demo.qz.io](https://demo.qz.io/).
- Revisar que el navegador y QZ Tray no estén bloqueados por firewall o antivirus.
- En Firefox, reinstalar QZ con Firefox completamente cerrado.

### QZ está activo, pero no aparecen impresoras

- Verificar que la impresora exista en el sistema operativo.
- Imprimir una página de prueba desde el sistema.
- Reiniciar la cola de impresión o el PC.
- Reinstalar el controlador oficial del fabricante.
- Pulsar nuevamente **Detectar en este PC**.

### La tarjeta dice “No detectada aquí”

- La asignación puede haberse creado desde otro PC.
- El nombre de la impresora pudo cambiar al reinstalar el controlador.
- Eliminar la asignación y crearla nuevamente desde la estación correcta.

### La etiqueta sale cortada, girada o escalada

- Verificar el tamaño configurado en el controlador.
- Desactivar ajustes automáticos como “Ajustar a página” en el controlador.
- Confirmar el tamaño seleccionado para las etiquetas SKU.
- Calibrar el sensor de papel de la impresora.
- Revisar orientación, márgenes y densidad desde las preferencias del controlador.

### La impresión automática falla, pero el PDF abre correctamente

El servidor y la generación de la etiqueta están funcionando. El problema está limitado a QZ Tray, al nombre asignado o a la impresora local. Se puede continuar imprimiendo manualmente mientras se corrige la estación.

## 11. Checklist de entrega de una estación

- [ ] Impresora instalada y página de prueba correcta.
- [ ] QZ Tray instalado y configurado para iniciar automáticamente.
- [ ] QZ Tray visible en la bandeja del sistema.
- [ ] Demo oficial detecta la impresora.
- [ ] WMS detecta la impresora desde el PC correcto.
- [ ] Mesa o puesto de Bodega asignado correctamente.
- [ ] Impresión automática validada.
- [ ] Tamaño, orientación y código de barras validados.
- [ ] Fallback manual validado con QZ cerrado.
- [ ] Ventanas emergentes permitidas para el WMS.
- [ ] Operador instruido para verificar que QZ esté activo al comenzar el turno.

## Referencias oficiales

- [Descargar QZ Tray](https://qz.io/download/)
- [Instalación y prueba de QZ Tray](https://qz.io/docs/using-qz-tray)
- [Introducción para impresión web](https://qz.io/docs/getting-started)
- [Despliegue en varias estaciones](https://qz.io/docs/deployment)
- [Aprovisionamiento y certificado raíz propio](https://qz.io/docs/provisioning)
