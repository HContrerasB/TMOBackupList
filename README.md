# TMOBackupList

Script para hacer **backup y recuperación de listas de TMO** directamente desde la consola del navegador.

> Diseñado para recorrer listas de forma segura, evitando bloqueos por múltiples peticiones mediante pausas controladas.
> Probado con éxito en **87 listas completas**.

---

# ¿Qué hace este proyecto?

Este script permite:

- recorrer automáticamente todas tus listas
- entrar manga por manga
- rescatar información importante
- calcular progreso
- exportar datos estructurados
- generar respaldo en JSON o TXT
- conservar la información en caso de pérdida

Ideal para usuarios que quieran proteger sus listas o migrarlas en el futuro.

---

# Características principales

- Recorre múltiples listas automáticamente
- Soporta paginación entre páginas de listas
- Evita rate limit de TMO con delays seguros
- Recupera información detallada del manga
- Calcula porcentaje de progreso
- Exportación estructurada
- Formato fácil de reutilizar
- Probado en cuentas grandes (+87 listas)
- Script de **345 líneas documentado y mantenible**

---

# Requisitos

- Tener cuenta en TMO
- Haber iniciado sesión
- Acceso a la sección de listas
- Navegador Chrome, Edge, Opera o Firefox
- Acceso a consola del navegador

---

# Ruta donde debe ejecutarse

Entrar a:

https://zonatmo.nakamasweb.com/profile/lists

---

# Guía paso a paso (para todos)

## Paso 1: inicia sesión
Abre TMO e inicia sesión normalmente.

---

## Paso 2: entra a tus listas
Ve al menú de perfil y entra en:

MIS LISTAS

o abre directamente:

https://zonatmo.nakamasweb.com/profile/lists

---

## Paso 3: abre la consola
Presiona:

F12

o:

Ctrl + Shift + J

Luego abre la pestaña:

Console / Consola

---

## Paso 4: habilita pegado (si es necesario)
Si el navegador no te deja pegar, escribe:

allow pasting

Presiona Enter.

---

## Paso 5: pega el script completo
Copia el archivo `backup-tmo.js` completo y pégalo en la consola.

Luego presiona:

Enter

---

## Paso 6: espera a que termine
El script empezará a trabajar automáticamente.

Durante este proceso:

- recorrerá listas
- cambiará páginas
- entrará a cada manga
- leerá información
- calculará progreso
- mostrará avances en consola

MUY IMPORTANTE:

- no cierres la pestaña
- no recargues
- no vuelvas a pegar el script
- no abras varias pestañas de TMO

Si parece lento, es normal.

La lentitud está hecha a propósito para evitar el bloqueo por múltiples peticiones.

---

## Paso 7: revisa la consola
Verás mensajes como:

- lista actual
- manga procesado
- páginas recorridas
- porcentaje
- errores controlados
- finalización

---

## Paso 8: guarda tu backup
Cuando termine, copia el resultado final y guárdalo como:

backup-tmo.json

o

MIS_MANGAS_RESCATADOS.txt

---

# Formato del reporte

El archivo de salida utiliza un formato limpio y reutilizable.

## Vista tipo tabla

LISTA           | TIPO   | DEMOGRAFÍA | ESTADO     | CAP. ACTUAL | CAP. MÁXIMO | AVANCE  | NOMBRE DEL MANGA
------------------------------------------------------------------------------------------------------------------------
lista 1 2026    | MANGA  | Josei      | Finalizado | 21.00       | 87.00       | 24.14%  | Wotaku ni Koi wa Muzukashii

---

## Vista JSON estructurada

{
  "lista": "lista 1 2026",
  "nombre": "Wotaku ni Koi wa Muzukashii",
  "descripcion": "La historia de un Otaku Gamer y una Fujoshi...",
  "url": "https://zonatmo.nakamasweb.com/library/manga/14012/wotakunikoiwamuzukashii",
  "tipo": "MANGA",
  "demografia": "Josei",
  "generos": [
    "Comedia",
    "Recuentos de la vida",
    "Romance"
  ],
  "estado": "Finalizado",
  "codigoInterno": "14012",
  "capituloActual": "21.00",
  "capituloMaximo": "87.00",
  "progresoPorcentaje": 24.14
}

---

# Campos incluidos

- lista: nombre de la lista
- nombre: nombre del manga
- descripcion: descripción de la ficha
- url: enlace directo
- tipo: manga/manhwa/manhua
- demografia: shonen, seinen, josei, etc
- generos: array de géneros
- estado: finalizado/en emisión
- codigoInterno: id interno
- capituloActual: capítulo registrado
- capituloMaximo: último capítulo detectado
- progresoPorcentaje: cálculo automático del avance

---

# Solución de problemas

## No deja pegar en consola
Escribe:

allow pasting

---

## F12 no funciona
Prueba:

Ctrl + Shift + I

o clic derecho → Inspeccionar

---

## El script parece detenido
Espera.

Puede estar haciendo pausas entre peticiones.

---

## Bloqueo por muchas peticiones
Espera unos minutos y vuelve a ejecutarlo.

No intentes acelerarlo.

---

# Buenas prácticas

- úsalo solo en tu cuenta o con permiso
- guarda varios backups
- no modifiques delays sin saber
- no hagas spam de ejecución
- evita correrlo en horas de mucho tráfico

---

# Estado del proyecto

- Script funcional
- Probado en listas grandes
- 87 listas rescatadas exitosamente
- Próxima meta: versión Tampermonkey
- Posible extensión Chrome
- Restauración automática futura

---

# Cómo contribuir

Las mejoras más útiles serían:

- exportación automática a archivo
- interfaz visual
- versión userscript
- reintentos automáticos
- logs más bonitos
- recuperación incremental
- restauración de listas

---

# Licencia

MIT License

Uso libre para la comunidad, mejoras, forks y mantenimiento colaborativo.

---

# Aviso

Proyecto creado con fines de **backup y preservación de listas personales**.

Úsalo con responsabilidad y evitando abuso de peticiones al sitio.
