import React from 'react';
import { SignIn, SignUp } from '@clerk/clerk-react';
import { Layers } from 'lucide-react';

export const AuthPage: React.FC<{ mode: 'signin' | 'signup' }> = ({ mode }) => {
  return (
    <div className="flex flex-col h-screen w-screen bg-zinc-950 text-zinc-100 font-sans overflow-hidden items-center justify-center">
      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
          <Layers className="w-6 h-6" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Nexus-RAG</h1>
          <p className="text-sm text-zinc-400 mt-1">Agentic Document Intelligence</p>
        </div>
      </div>
      
      {mode === 'signin' ? (
        <SignIn 
          appearance={{
            elements: {
              card: "bg-zinc-900 border border-zinc-800 shadow-xl",
              headerTitle: "text-zinc-100",
              headerSubtitle: "text-zinc-400",
              socialButtonsBlockButton: "bg-zinc-800 border-zinc-800 text-zinc-200 hover:bg-zinc-800",
              socialButtonsBlockButtonText: "text-zinc-200 font-medium",
              dividerLine: "bg-zinc-800",
              dividerText: "text-zinc-500",
              formFieldLabel: "text-zinc-300",
              formFieldInput: "bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-indigo-500",
              formButtonPrimary: "bg-indigo-600 hover:bg-indigo-500 text-white",
              footerActionText: "text-zinc-400",
              footerActionLink: "text-indigo-400 hover:text-indigo-300"
            }
          }}
        />
      ) : (
        <SignUp 
           appearance={{
            elements: {
              card: "bg-zinc-900 border border-zinc-800 shadow-xl",
              headerTitle: "text-zinc-100",
              headerSubtitle: "text-zinc-400",
              socialButtonsBlockButton: "bg-zinc-800 border-zinc-800 text-zinc-200 hover:bg-zinc-800",
              socialButtonsBlockButtonText: "text-zinc-200 font-medium",
              dividerLine: "bg-zinc-800",
              dividerText: "text-zinc-500",
              formFieldLabel: "text-zinc-300",
              formFieldInput: "bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-indigo-500",
              formButtonPrimary: "bg-indigo-600 hover:bg-indigo-500 text-white",
              footerActionText: "text-zinc-400",
              footerActionLink: "text-indigo-400 hover:text-indigo-300"
            }
          }}
        />
      )}
    </div>
  );
};
