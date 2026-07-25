import React, { useState } from "react";
import { Layers, ShieldCheck, Cpu } from "lucide-react";
import { PdfUploader } from "./components/PdfUploader";
import { ChatInterface } from "./components/ChatInterface";

export const App: React.FC = () => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [ingestedDocCount, setIngestedDocCount] = useState(0);

  // 1. Chat reset કરવા માટેનો સ્ટેટ
  const [resetKey, setResetKey] = useState(0);

  const handleIngestSuccess = () => {
    setIngestedDocCount((prev) => prev + 1);

    // 2. નવી PDF અપલોડ થાય ત્યારે LocalStorage માંથી જૂની ચેટ ડિલીટ કરો
    localStorage.removeItem("nexus_rag_chat_history");

    // 3. ChatInterface ને રી-માઉન્ટ (Reset) કરો
    setResetKey((prev) => prev + 1);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
      {/* Header Bar */}
      <header className="max-w-7xl mx-auto mb-8 flex flex-col md:flex-row items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-sky-500/10 rounded-2xl border border-sky-500/20 text-sky-400">
            <Layers className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-50">
              Nexus-RAG
            </h1>
            <p className="text-xs text-slate-400">
              Enterprise Document Intelligence Engine
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-4 text-xs">
          <div className="flex items-center space-x-1.5 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl text-slate-300">
            <Cpu className="w-4 h-4 text-sky-400" />
            <span>Groq Llama-3.3-70B</span>
          </div>
          <div className="flex items-center space-x-1.5 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl text-slate-300">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Cohere Rerank v3</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4">
          <PdfUploader onIngestSuccess={handleIngestSuccess} />
        </div>

        <div className="lg:col-span-8">
          {/* Key આપવાથી resetKey બદલાતા જ ChatInterface ફ્રેશ રીસેટ થશે */}
          <ChatInterface key={resetKey} />
        </div>
      </main>
    </div>
  );
};

export default App;
