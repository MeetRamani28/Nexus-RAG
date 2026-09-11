import React from 'react';
import { SignIn, SignUp } from '@clerk/clerk-react';


export const AuthPage: React.FC<{ mode: 'signin' | 'signup' }> = ({ mode }) => {
  return (
    <div className="flex flex-col h-screen w-screen bg-zinc-950 text-zinc-100 font-sans overflow-hidden items-center justify-center">
      <div className="mb-6 flex flex-col items-center gap-2.5 z-10">
        <div className="w-14 h-14 rounded-2xl overflow-hidden border border-indigo-500/30 shadow-2xl shadow-indigo-500/20">
          <img src="/logo.jpg" alt="Nexus-RAG Logo" className="w-full h-full object-cover" />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-100">Nexus-RAG</h1>
          <p className="text-xs text-zinc-400 mt-0.5">Agentic Document Intelligence</p>
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
