@AGENTS.md

## Pendiente — Mostrar concesiones eliminadas/caducadas en el mapa

Hoy el filtro en src/app/api/concesiones/sernageomin/route.ts excluye
explícitamente las concesiones con SITUACION_CONCESION = 'ELIMINADA'.
Se pidió agregar también las caducadas (y revisar si también las
eliminadas) al mapa.

DECISIÓN PENDIENTE, sin resolver todavía — no empezar el código sin
esto: ¿se muestran con un estilo visual distinto (color/patrón que las
diferencie claramente de las vigentes), o se quitan del filtro sin más?
Dado que el producto se usa para decisiones legales/comerciales sobre
el catastro minero, mostrarlas sin diferenciación visual clara podría
hacer que un usuario confunda una concesión caducada con una vigente.

Debe hacerse en una rama nueva y separada (una tarea por sesión), nunca
mezclada con el fix de seguridad de los endpoints de concesiones.
