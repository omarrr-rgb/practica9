# CyberNews CI — Práctica 9

Copia didáctica de la aplicación de la práctica 8. Esta versión agrega una prueba HTTP y dos workflows de GitHub Actions. El código de la práctica 8 original permanece intacto.

Lee primero `../GUIA_ALUMNO.md` en el ZIP de la práctica. Al publicar este directorio, su contenido debe quedar en la **raíz** del repositorio GitHub para que `.github/workflows/` sea detectado.

## Comprobaciones del workflow

```text
pnpm install --frozen-lockfile  -> instala exactamente lo registrado en pnpm-lock.yaml
pnpm run check                  -> comprueba sintaxis JavaScript
pnpm test                       -> comprueba HTTP, Helmet y acceso a dashboard
pnpm audit --audit-level high   -> consulta avisos conocidos de dependencias
```

No se requiere ejecutar el servidor, Docker ni Portainer en la computadora del alumno: los jobs se ejecutan en un runner de GitHub. La prueba HTTP inicia la aplicación temporalmente en un puerto libre y la cierra al terminar.

## Alcance de seguridad

Los checks automáticos detectan ciertos errores y hallazgos. No sustituyen una revisión manual de seguridad, pruebas de autorización completas, SAST, escaneo de imagen, DAST ni una configuración segura de producción. La aplicación conserva credenciales y secreto de **demostración** del material de clase: no los uses como credenciales reales ni despliegues esta copia en producción.
