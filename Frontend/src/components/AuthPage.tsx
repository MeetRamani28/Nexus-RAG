import React from 'react';
import { SignIn, SignUp } from '@clerk/clerk-react';
import { Layers } from 'lucide-react';

export const AuthPage: React.FC<{ mode: 'signin' | 'signup' }> = ({ mode }) => {
  return (
    <div className="flex flex-col h-screen w-screen bg-[#050811] text-slate-100 font-sans overflow-hidden items-center justify-center">
      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
          <Layers className="w-6 h-6" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-slate-100">Nexus-RAG</h1>
          <p className="text-sm text-slate-400 mt-1">Agentic Document Intelligence</p>
        </div>
      </div>
      
      {mode === 'signin' ? (
        <SignIn 
          appearance={{
            elements: {
              card: "bg-slate-900 border border-slate-800 shadow-xl",
              headerTitle: "text-slate-100",
              headerSubtitle: "text-slate-400",
              socialButtonsBlockButton: "bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700",
              socialButtonsBlockButtonText: "text-slate-200 font-medium",
              dividerLine: "bg-slate-700",
              dividerText: "text-slate-500",
              formFieldLabel: "text-slate-300",
              formFieldInput: "bg-slate-950 border-slate-700 text-slate-100 focus:border-blue-500",
              formButtonPrimary: "bg-blue-600 hover:bg-blue-500 text-white",
              footerActionText: "text-slate-400",
              footerActionLink: "text-blue-400 hover:text-blue-300"
            }
          }}
        />
      ) : (
        <SignUp 
           appearance={{
            elements: {
              card: "bg-slate-900 border border-slate-800 shadow-xl",
              headerTitle: "text-slate-100",
              headerSubtitle: "text-slate-400",
              socialButtonsBlockButton: "bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700",
              socialButtonsBlockButtonText: "text-slate-200 font-medium",
              dividerLine: "bg-slate-700",
              dividerText: "text-slate-500",
              formFieldLabel: "text-slate-300",
              formFieldInput: "bg-slate-950 border-slate-700 text-slate-100 focus:border-blue-500",
              formButtonPrimary: "bg-blue-600 hover:bg-blue-500 text-white",
              footerActionText: "text-slate-400",
              footerActionLink: "text-blue-400 hover:text-blue-300"
            }
          }}
        />
      )}
    </div>
  );
};
