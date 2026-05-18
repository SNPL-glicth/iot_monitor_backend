# Contributing Guide

## Configuración del entorno

1. Copiar `.env.example` a `.env` y completar credenciales reales.
2. `npm install`
3. Verificar que SQL Server esté accesible en el puerto configurado.

## Convenciones de código

- **TypeScript**: Tipado estricto. Evitar `any`. Usar `unknown` cuando sea necesario.
- **DTOs**: Todos los `@Body()` deben usar DTOs validados con `class-validator`.
- **Nombres**: Servicios en PascalCase suffijo `Service`. Archivos en kebab-case.
- **Logging**: Usar `Logger` de NestJS. Nunca `console.log` en producción.

## Estructura de commits

```
feat(module): descripción breve

- Detalle 1
- Detalle 2

Refs: #issue
```

Tipos: `feat`, `fix`, `docs`, `refactor`, `test`, `security`.

## Pull Request checklist

- [ ] `npm run lint` pasa sin errores
- [ ] `npm run test` pasa sin regresiones
- [ ] DTOs tienen validación para inputs de usuario
- [ ] No se exponen secrets en logs ni respuestas
- [ ] Cambios documentados en CHANGELOG.md

## Seguridad

- Nunca commitear `.env`.
- Reportar vulnerabilidades a `security@yourdomain.com` (ver SECURITY.md).
