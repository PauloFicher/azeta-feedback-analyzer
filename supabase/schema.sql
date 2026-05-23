-- P2 - Feedback Analyzer Schema
-- Tablas: feedback_items (con analisis), companies (brand tone config)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Empresas del Grupo Azeta (para configurar tono de respuesta)
CREATE TABLE IF NOT EXISTS public.companies (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  vertical    TEXT NOT NULL,
  brand_tone  TEXT NOT NULL DEFAULT 'profesional_cordial',
  logo_url    TEXT,
  is_active   BOOLEAN DEFAULT true NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL
);

INSERT INTO public.companies (name, vertical, brand_tone) VALUES
  ('Biggie', 'retail', 'cercano_amigable'),
  ('Zeta Banco', 'finanzas', 'profesional_seguro'),
  ('Azeta Inmobiliaria', 'inmobiliario', 'confiable_formal'),
  ('Tigo Paraguay', 'telecomunicaciones', 'innovador_dinamico')
ON CONFLICT (name) DO NOTHING;

-- Feedback recibido + analisis
CREATE TABLE IF NOT EXISTS public.feedback_items (
  id              UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id      UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  source          TEXT NOT NULL DEFAULT 'formulario',
  customer_name   TEXT,
  customer_email  TEXT,
  original_text   TEXT NOT NULL CHECK (char_length(original_text) <= 10000),

  -- Campos del analisis LLM
  sentiment       TEXT CHECK (sentiment IN ('positivo','neutro','negativo')),
  urgency         TEXT CHECK (urgency IN ('baja','media','alta','critica')),
  category        TEXT,
  summary         TEXT,

  -- Respuesta generada por IA
  draft_response  TEXT,
  is_approved     BOOLEAN DEFAULT false,
  finalized_response TEXT,

  -- Metadata
  tokens_used     INTEGER DEFAULT 0,
  provider        TEXT DEFAULT 'openai',
  analyzed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indices
CREATE INDEX idx_feedback_company  ON public.feedback_items(company_id, created_at DESC);
CREATE INDEX idx_feedback_sentiment ON public.feedback_items(sentiment);
CREATE INDEX idx_feedback_urgency   ON public.feedback_items(urgency, created_at DESC);
CREATE INDEX idx_feedback_pending   ON public.feedback_items(is_approved, created_at);

-- RLS
ALTER TABLE public.companies      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_companies" ON public.companies FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read_feedback"  ON public.feedback_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "anon_insert_feedback" ON public.feedback_items FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "auth_update_feedback" ON public.feedback_items FOR UPDATE TO authenticated USING (true);
