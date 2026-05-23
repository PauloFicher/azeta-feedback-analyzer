'use client';

import { useState } from 'react';

export default function Home() {
  const [text, setText] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const analyze = async () => {
    if (!text || loading) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ error: 'Error al conectar con el analizador.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="max-w-3xl mx-auto p-6 min-h-screen bg-[#f5f5f7]">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-[#1d1d1f] tracking-tight">Customer Feedback Analyzer</h1>
        <p className="text-[#86868b] mt-1">Grupo Azeta &middot; Analisis de sentimiento con IA (Groq)</p>
      </header>

      <div className="bg-white rounded-2xl border border-black/5 p-6 space-y-4">
        <textarea
          className="w-full h-32 p-4 rounded-xl border border-black/[0.08] text-sm text-[#1d1d1f] placeholder:text-[#86868b] resize-none focus:outline-none focus:border-[#0071e3] focus:ring-2 focus:ring-[#0071e3]/10 transition-all"
          placeholder="Pega el feedback del cliente..."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          onClick={analyze}
          disabled={loading || !text.trim()}
          className="px-6 py-2.5 bg-[#0071e3] text-white rounded-full text-sm font-medium hover:bg-[#0077ed] disabled:opacity-30 transition-all"
        >
          {loading ? 'Analizando...' : 'Analizar'}
        </button>

        {result && (
          <div className="mt-6 p-5 bg-[#f5f5f7] rounded-xl border border-black/5">
            {result.error ? (
              <p className="text-red-500 text-sm">{result.error}</p>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <span className="px-3 py-1 rounded-full text-[13px] font-medium bg-[#0071e3]/10 text-[#0071e3]">
                    {result.sentiment === 'positivo' ? 'Positivo' : result.sentiment === 'negativo' ? 'Negativo' : 'Neutro'}
                  </span>
                  <span className="px-3 py-1 rounded-full text-[13px] font-medium bg-orange-50 text-orange-600">
                    Urgencia: {result.urgency}
                  </span>
                  <span className="px-3 py-1 rounded-full text-[13px] font-medium bg-purple-50 text-purple-600">
                    {result.category}
                  </span>
                </div>
                <p className="text-sm text-[#6e6e73]">{result.summary}</p>
                {result.draftResponse && (
                  <div className="p-4 bg-white rounded-xl border border-[#0071e3]/20">
                    <p className="text-[11px] font-semibold text-[#0071e3] uppercase tracking-wider mb-2">Borrador de respuesta</p>
                    <p className="text-sm text-[#1d1d1f] leading-relaxed">{result.draftResponse}</p>
                  </div>
                )}
                <p className="text-[11px] text-[#86868b]">~{result.tokensUsed} tokens ({result.provider})</p>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
