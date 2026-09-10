import os
import glob

def replace_in_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Colors
    content = content.replace('bg-[#050811]', 'bg-zinc-950')
    content = content.replace('bg-[#0a0f1c]/80', 'bg-zinc-900/80')
    content = content.replace('bg-[#0a0f1c]', 'bg-zinc-900')
    content = content.replace('bg-[#0f172a]', 'bg-zinc-900')
    
    # Replace slate with zinc for a cleaner gray
    content = content.replace('slate-100', 'zinc-100')
    content = content.replace('slate-200', 'zinc-200')
    content = content.replace('slate-300', 'zinc-300')
    content = content.replace('slate-400', 'zinc-400')
    content = content.replace('slate-500', 'zinc-500')
    content = content.replace('slate-600', 'zinc-600')
    content = content.replace('slate-700', 'zinc-800') # Darker borders
    content = content.replace('slate-800', 'zinc-800')
    content = content.replace('slate-900', 'zinc-900')
    content = content.replace('slate-950', 'zinc-950')

    # Replace blue with a more refined indigo
    content = content.replace('blue-100', 'indigo-100')
    content = content.replace('blue-200', 'indigo-200')
    content = content.replace('blue-300', 'indigo-300')
    content = content.replace('blue-400', 'indigo-400')
    content = content.replace('blue-500', 'indigo-500')
    content = content.replace('blue-600', 'indigo-600')
    content = content.replace('blue-700', 'indigo-700')
    
    # Remove extreme glassmorphism/shadows to look less "AI generated"
    content = content.replace('shadow-[0_0_40px_-10px_rgba(59,130,246,0.3)]', 'shadow-md')
    content = content.replace('backdrop-blur-xl', 'backdrop-blur-md')
    content = content.replace('rounded-2xl', 'rounded-xl')
    content = content.replace('animate-pulse', '')
    content = content.replace('animate-bounce', '')

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

for filepath in glob.glob('src/**/*.tsx', recursive=True):
    replace_in_file(filepath)

print("Theme updated!")
