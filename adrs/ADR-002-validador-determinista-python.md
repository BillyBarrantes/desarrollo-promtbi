# ADR-002: Validador determinista en Python para evitar alucinaciones

## Estado
Aceptado

## Contexto
El objetivo de ViPromt exige cero alucinaciones tecnicas en geometria, cumplimiento RNE y coherencia MEP.
Las respuestas de modelos generativos pueden ser plausibles pero incorrectas en restricciones fisicas y normativas.

## Decision
Se implementa un validador determinista en Python como gate obligatorio posterior al LLM.
Este modulo valida geometria, reglas RNE parametrizadas, restricciones estructurales y reglas de optimizacion MEP antes de emitir un resultado aprobado.

## Justificacion
- Garantiza verificabilidad matematica y normativa.
- Permite explicar rechazos con evidencia concreta y auditable.
- Estandariza la calidad de salida, independientemente del comportamiento del modelo.

## Consecuencias
- Los resultados pueden ser rechazados aun cuando el LLM responda en formato correcto.
- Se necesita mantenimiento continuo del catalogo de reglas RNE.
- Se habilita testing de regresion objetivo con casos limite.

## Trade-offs
- Mayor esfuerzo de implementacion inicial.
- Se requiere versionado de reglas para trazabilidad historica.
