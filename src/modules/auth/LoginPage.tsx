import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { ShieldCheck, Eye, EyeOff, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Email ou senha invalidos. Verifique suas credenciais.')
    } else {
      navigate('/')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen w-full flex">
      <div className="hidden lg:flex lg:w-1/2 xl:w-3/5 relative bg-gradient-to-br from-[#0f2744] via-[#1a365d] to-[#1e4a8a] flex-col items-center justify-center p-16 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-white/5" />
          <div className="absolute top-1/2 -left-32 w-80 h-80 rounded-full bg-[#f5a623]/10" />
          <div className="absolute -bottom-24 right-1/4 w-64 h-64 rounded-full bg-white/5" />
        </div>
        <div className="relative z-10 max-w-lg text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-[#f5a623] mb-8 shadow-2xl">
            <ShieldCheck size={40} className="text-[#0f2744]" strokeWidth={2.5} />
          </div>
          <h1 className="text-4xl xl:text-5xl font-black text-white mb-4 leading-tight">
            EngMarq <span className="text-[#f5a623]">SST</span>
          </h1>
          <p className="text-lg text-white/70 mb-12 leading-relaxed">
            Sistema Integrado de Gestao de Seguranca e Saude no Trabalho
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            {['Documentos com semaforo', 'Gestao de colaboradores', 'Controle de treinamentos', 'Dashboard em tempo real'].map(f => (
              <span key={f} className="bg-white/10 backdrop-blur text-white/80 text-sm font-medium px-4 py-2 rounded-full border border-white/10">
                {f}
              </span>
            ))}
          </div>
        </div>
        <p className="absolute bottom-8 text-white/30 text-xs">
          EngMarq Solucoes em Engenharia
        </p>
      </div>
      <div className="w-full lg:w-1/2 xl:w-2/5 flex items-center justify-center bg-white p-8">
        <div className="w-full max-w-sm">
          <div className="flex lg:hidden items-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-xl bg-[#1a365d] flex items-center justify-center">
              <ShieldCheck size={20} className="text-[#f5a623]" />
            </div>
            <span className="text-xl font-black text-[#1a365d]">EngMarq SST</span>
          </div>
          <h2 className="text-2xl font-black text-gray-900 mb-1">Bem-vindo de volta</h2>
          <p className="text-sm text-gray-500 mb-8">Entre com suas credenciais para acessar o sistema</p>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="seu@email.com"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a365d]/30 focus:border-[#1a365d] focus:bg-white transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1.5">Senha</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="..."
                  className="w-full px-4 py-3 pr-12 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1a365d]/30 focus:border-[#1a365d] focus:bg-white transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            {error && (
              <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
                <span className="mt-0.5 flex-shrink-0">!</span>
                <span>{error}</span>
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#1a365d] hover:bg-[#0f2744] active:scale-[0.98] text-white font-bold py-3 rounded-xl text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-[#1a365d]/25 mt-2"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : null}
              {loading ? 'Entrando...' : 'Entrar no sistema'}
            </button>
          </form>
          <p className="text-center text-xs text-gray-400 mt-8">
            Acesso restrito a usuarios autorizados
          </p>
        </div>
      </div>
    </div>
  )
}
