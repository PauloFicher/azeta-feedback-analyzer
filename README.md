# P2 - Customer Feedback Analyzer | Grupo Azeta

## ① Objetivo de negocio

**Problema:** Grupo Azeta recibe 10,000+ mensajes de feedback al mes entre encuestas, redes sociales y formularios. Tiempo promedio de respuesta: 48 horas. Estandar de satisfaccion: <4 horas.

**Solucion:** Pipeline que ingesta feedback, clasifica sentimiento/urgencia/categoria con LLM, almacena en Supabase, y genera borrador de respuesta con tono de marca configurable por empresa.

## ② Arquitectura

```
POST /api/analyze { text, companyId }
    |
    v
LLM Call 1: Clasificacion (sentiment, urgency, category, summary)
    |   Prompt: JSON estructurado, reglas de urgencia SLA
    |   Token optimization: ~300 tokens max
    |
    v
LLM Call 2: Generacion de respuesta
    |   Prompt: Incluye tono de marca desde companies.brand_tone
    |   Token optimization: ~400 tokens max
    |
    v
Supabase INSERT -> feedback_items
    |   Response: { id, sentiment, urgency, category, summary, draftResponse }
```

## ③ Decisiones tecnicas clave

**Por que dos LLM calls separadas y no una sola:**
- Si la clasificacion falla (JSON mal formado), no gastamos tokens en generar respuesta.
- Cada prompt esta optimizado para una tarea especifica, reduciendo alucinaciones.
- Temperatura baja (0.1) para clasificacion (deterministico), media (0.5) para generacion (creatividad controlada).

**Por que prompt en JSON estructurado sin tools:**
- Para clasificacion simple, JSON mode es mas rapido y barato que function calling.
- Function calling agrega ~200 tokens extra por tool definition.
- Usamos `gpt-4o-mini` (default) porque la clasificacion no requiere razonamiento complejo.

**Por que tono de marca en BD y no en prompt hardcodeado:**
- Las 17 empresas de Azeta tienen tonos distintos. Guardar en `companies.brand_tone` permite cambiar sin redeploy.
- El prompt de generacion consulta la BD antes de armar el system prompt.

## ④ Variables de entorno

```
OPENAI_API_KEY=sk-proj-...
ANTHROPIC_API_KEY=sk-ant-...    # Alternativa Claude
LLM_PROVIDER=openai             # "openai" o "anthropic"
SUPABASE_SERVICE_ROLE_KEY=...
```

## ⑤ Deploy

```bash
cd P2-feedback-analyzer
pnpm install
cp .env.example .env.local
pnpm dev
# Vercel: mismo proceso que P0/P1
```

## ⑥ Argumentos de entrevista

**Impacto en Azeta:** Reducir tiempo de respuesta de 48h a <4h automatizando el 80% del flujo (clasificacion + borrador). El agente humano solo revisa y aprueba.

**Escalabilidad:** El sistema usa la misma tabla para las 17 empresas. `companies.brand_tone` configura el tono por empresa sin cambiar codigo.

**SLA mapeado:** Urgencia "critica" -> respuesta sugerida <1h, "alta" -> <4h, "media" -> <24h, "baja" -> no urgente.
