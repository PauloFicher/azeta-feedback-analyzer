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
    <main className="max-w-4xl mx-auto p-6 min-h-screen">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Customer Feedback Analyzer</h1>
        <p className="text-slate-500 mt-1">Grupo Azeta - Analisis de sentimiento con IA</p>
      </header>

      <div className="bg-white rounded-2xl border p-6 shadow-sm space-y-4">
        <textarea
          className="w-full h-32 p-4 border rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-500"
          placeholder="Pega el feedback del cliente aca..."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          onClick={analyze}
          disabled={loading || !text}
          className="px-6 py-2.5 bg-teal-600 text-white rounded-xl font-semibold hover:bg-teal-700 disabled:opacity-30 transition-all"
        >
          {loading ? 'Analizando...' : 'Analizar'}
        </button>

        {result && (
          <div className="mt-6 p-4 bg-slate-50 rounded-xl border">
            {result.error ? (
              <p className="text-red-600">{result.error}</p>
            ) : (
              <div className="space-y-3">
                <div className="flex gap-4 text-sm">
                  <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-700">
                    {result.sentiment}
                  </span>
                  <span className="px-3 py-1 rounded-full bg-orange-100 text-orange-700">
                    Urgencia: {result.urgency}
                  </span>
                  <span className="px-3 py-1 rounded-full bg-purple-100 text-purple-700">
                    {result.category}
                  </span>
                </div>
                <p className="text-sm text-slate-600">{result.summary}</p>
                {result.draftResponse && (
                  <div className="mt-4 p-4 bg-white rounded-lg border border-teal-200">
                    <p className="text-xs text-teal-600 font-semibold mb-2">Borrador de respuesta:</p>
                    <p className="text-sm text-slate-700">{result.draftResponse}</p>
                  </div>
                )}
                <p className="text-xs text-slate-400">~{result.tokensUsed} tokens ({result.provider})</p>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
