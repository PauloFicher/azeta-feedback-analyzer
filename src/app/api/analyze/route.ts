/**
 * P2 - Customer Feedback Analyzer: Core Analysis API
 *
 * POST /api/analyze
 * Body: { text, companyId, customerName?, customerEmail? }
 *
 * Pipeline:
 * 1. Clasificar sentimiento + urgencia + categoria (LLM call 1)
 * 2. Generar borrador de respuesta con tono de marca (LLM call 2)
 * 3. Guardar en Supabase
 *
 * Razonamiento de prompts separados:
 * - Separar clasificacion de generacion: si la clasificacion falla,
 *   no gastamos tokens en generar respuesta.
 * - Cada prompt esta optimizado para una tarea especifica,
 *   reduciendo alucinaciones por sobrecarga de instrucciones.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function getOpenAIClient(): OpenAI {
  const provider = process.env.LLM_PROVIDER || 'openai';
  if (provider === 'anthropic') {
    return new OpenAI({
      apiKey: process.env.ANTHROPIC_API_KEY,
      baseURL: 'https://api.anthropic.com/v1',
      defaultHeaders: {
        'anthropic-version': '2023-06-01',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
      },
    });
  }
  if (provider === 'deepseek') {
    return new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY,
      baseURL: 'https://api.deepseek.com/v1',
    });
  }
  if (provider === 'groq') {
    return new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: 'https://api.groq.com/openai/v1',
    });
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// ============================================================
// Prompt 1: Clasificacion (sentimiento + urgencia + categoria)
// Razonamiento:
// - Salida JSON estructurada con valores obligatorios
// - Categorias relevantes para empresas de Azeta
// - Urgencia mapeada a SLA de respuesta (<1h, <4h, <24h, >24h)
// ============================================================
const CLASSIFICATION_PROMPT = `Analiza el siguiente feedback de cliente de una empresa del Grupo Azeta (Paraguay).
Devuelve UNICAMENTE un objeto JSON valido con esta estructura exacta:

{
  "sentiment": "positivo" | "neutro" | "negativo",
  "urgency": "baja" | "media" | "alta" | "critica",
  "category": "producto" | "servicio" | "precio" | "experiencia_sucursal" | "facturacion" | "soporte_tecnico" | "otro",
  "summary": "Resumen en 1 oracion del feedback"
}

Reglas de urgencia:
- "critica": cliente amenaza con darse de baja, menciona abogados, o esta en una situacion de fraude/estafa
- "alta": cliente reporta falla grave del servicio, imposibilidad de usar producto
- "media": queja o reclamo normal, espera respuesta pronto
- "baja": sugerencia, comentario general, o feedback positivo (no requiere respuesta inmediata)

NO incluyas ningun texto fuera del JSON. Solo el JSON.`;

// ============================================================
// Prompt 2: Generacion de respuesta con tono de marca
// Razonamiento:
// - Recibe el tono de marca desde la BD (companies.brand_tone)
// - Instrucciones de formato: lo minimo necesario para que el
//   agente de atencion al cliente solo tenga que revisar y aprobar
// ============================================================
function getDraftPrompt(brandTone: string, sentimiento: string): string {
  const toneInstructions: Record<string, string> = {
    cercano_amigable: 'Usa un tono calido y cercano, como si hablaras con un vecino. Podes usar "che" o expresiones locales paraguayas con moderacion.',
    profesional_seguro: 'Usa un tono formal, seguro y transparente. El cliente debe sentir confianza absoluta. Menciona politicas de seguridad si aplica.',
    confiable_formal: 'Usa un tono formal y respetuoso. El cliente busca seriedad. Cita clausulas o procesos especificos si aplica.',
    innovador_dinamico: 'Usa un tono moderno y energico. El cliente espera soluciones agiles. Podes usar lenguaje mas casual pero profesional.',
    profesional_cordial: 'Tono cordial y profesional. Balance entre calidez y formalidad.',
  };

  const toneGuide = toneInstructions[brandTone] || toneInstructions.profesional_cordial;

  return `Eres un agente de atencion al cliente del Grupo Azeta. Genera un borrador de respuesta para este feedback.

TONO DE MARCA: ${toneGuide}

SENTIMIENTO DETECTADO: ${sentimiento}

ESTRUCTURA DE LA RESPUESTA:
1. Saludo personalizado (usa el nombre del cliente si esta disponible)
2. Empatia/reconocimiento del feedback (1 oracion)
3. Accion concreta o solucion (2-3 oraciones)
4. Cierre con datos de contacto para seguimiento

REGLAS:
- Maximo 150 palabras
- Si el feedback es positivo, agradece genuinamente
- Si es negativo, NO te disculpes en exceso. Enfocate en la solucion
- Si es urgente/critico, incluye un numero de telefono directo
- NUNCA prometas reembolsos o compensaciones sin autorizacion
- Firma como "Equipo de Atencion al Cliente - Grupo Azeta"`;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.text || typeof body.text !== 'string' || body.text.length < 10) {
      return NextResponse.json(
        { error: 'El texto del feedback debe tener al menos 10 caracteres.' },
        { status: 400 }
      );
    }

    // Obtener configuracion de tono de marca
    const { data: company } = body.companyId
      ? await supabaseAdmin
          .from('companies')
          .select('brand_tone')
          .eq('id', body.companyId)
          .single()
      : { data: { brand_tone: 'profesional_cordial' } };

    const brandTone = company?.brand_tone || 'profesional_cordial';
    const client = getOpenAIClient();
    const model = process.env.LLM_PROVIDER === 'anthropic' ? 'claude-3-haiku-20240307' : process.env.LLM_PROVIDER === 'deepseek' ? 'deepseek-chat' : process.env.LLM_PROVIDER === 'groq' ? (process.env.GROQ_MODEL || 'llama-3.1-8b-instant') : 'gpt-4o-mini';
    const provider = process.env.LLM_PROVIDER || 'openai';

    // Paso 1: Clasificar
    const classification = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: CLASSIFICATION_PROMPT },
        { role: 'user', content: body.text },
      ],
      temperature: 0.1,
      max_tokens: 300,
    });

    const rawJson = classification.choices[0].message.content?.trim() || '{}';
    let analysis: any = {};
    try {
      analysis = JSON.parse(rawJson.replace(/```json|```/g, ''));
    } catch {
      analysis = { sentiment: 'neutro', urgency: 'media', category: 'otro', summary: body.text.slice(0, 100) };
    }

    const tokens1 = classification.usage?.total_tokens || 0;

    // Paso 2: Generar draft response
    const draft = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: getDraftPrompt(brandTone, analysis.sentiment) },
        {
          role: 'user',
          content: `Feedback original: "${body.text}"\n\nResumen del analisis: ${analysis.summary}\nSentimiento: ${analysis.sentiment}\nUrgencia: ${analysis.urgency}`,
        },
      ],
      temperature: 0.5,
      max_tokens: 400,
    });

    const draftText = draft.choices[0].message.content?.trim() || '';
    const tokens2 = draft.usage?.total_tokens || 0;

    // Guardar en Supabase
    const { data: saved, error } = await supabaseAdmin
      .from('feedback_items')
      .insert({
        company_id: body.companyId || null,
        source: body.source || 'web',
        customer_name: body.customerName || null,
        customer_email: body.customerEmail || null,
        original_text: body.text,
        sentiment: analysis.sentiment,
        urgency: analysis.urgency,
        category: analysis.category,
        summary: analysis.summary,
        draft_response: draftText,
        tokens_used: tokens1 + tokens2,
        provider,
        analyzed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      id: saved.id,
      sentiment: analysis.sentiment,
      urgency: analysis.urgency,
      category: analysis.category,
      summary: analysis.summary,
      draftResponse: draftText,
      tokensUsed: tokens1 + tokens2,
      provider,
    });
  } catch (err: any) {
    console.error('[analyze] Error:', err);
    return NextResponse.json(
      { error: 'Error al analizar el feedback.' },
      { status: 500 }
    );
  }
}
