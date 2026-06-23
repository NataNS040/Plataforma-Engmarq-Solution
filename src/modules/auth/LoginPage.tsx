import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/modules/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import { ShieldCheck, Mail, Lock, Eye, EyeOff, ArrowRight, Loader2, HardHat } from 'lucide-react'

export default function LoginPage() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (session) navigate('/', { replace: true })
  }, [session, navigate])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Email ou senha inválidos. Verifique suas credenciais.')
      setLoading(false)
    }
    // Se autenticou com sucesso, o AuthProvider detecta a sessão
    // e o ProtectedRoute redireciona automaticamente para o dashboard
  }

  return (
    <>
      {/* Aurora: efeito de fundo animado */}
      <div className="aurora"><div className="blob" /></div>

      <div className="login-page">

        {/* ═══════════════════════════════════════
            PAINEL ESQUERDO — Hero / Branding
            (escondido em telas pequenas via CSS)
            ═══════════════════════════════════════ */}
        <div className="login-left">

          {/* Logo no topo */}
          <div className="lbrand">
            <div className="brand-mark">
              <ShieldCheck size={20} color="#0B1426" strokeWidth={2.5} />
            </div>
            <div>
              <div className="brand-name">EngMarq Vision</div>
              <div className="brand-tag">Gestão SST</div>
            </div>
          </div>

          {/* Conteúdo central: título + stats */}
          <div className="lcopy">
            <div className="login-badge">
              <HardHat size={13} />
              Engenharia de Segurança e Saúde do Trabalho
            </div>

            <h2>
              SST que garante{' '}
              <em>Segurança Jurídica</em>
            </h2>

            <p>
              Gestão completa de conformidade, NRs, ASOs e PCMSO em uma única
              plataforma — colaboradores seguros, documentação em dia e
              tranquilidade para operar.
            </p>

            {/* Card glassmorphism com métricas */}
            <div className="lglass">
              <div className="lglass-stat">
                <div className="v">+1.2k</div>
                <div className="l">Empresas atendidas</div>
              </div>
              <div className="lglass-stat">
                <div className="v">98,4%</div>
                <div className="l">Compliance médio</div>
              </div>
              <div className="lglass-stat">
                <div className="v">R$ 0</div>
                <div className="l">Multas em 2025</div>
              </div>
            </div>
          </div>

          <div className="lfoot">
            © 2026 EngMarq Solution · Política de privacidade
          </div>
        </div>

        {/* ═══════════════════════════════════════
            PAINEL DIREITO — Formulário de acesso
            ═══════════════════════════════════════ */}
        <div className="login-right">
          <div className="login-form">

            {/* Logo mobile (aparece só em telas pequenas) */}
            <div className="login-mobile-brand">
              <div className="brand-mark-sm">
                <ShieldCheck size={18} color="#F59E0B" strokeWidth={2.5} />
              </div>
              <span className="brand-text">EngMarq Vision</span>
            </div>

            <h1>Acessar plataforma</h1>
            <p className="sub">Entre com suas credenciais para acessar a plataforma.</p>

            <form onSubmit={handleSubmit}>

              {/* Campo: E-mail */}
              <div className="field">
                <label htmlFor="login-email">E-mail</label>
                <div className="ip">
                  <span className="ip-icon"><Mail size={15} /></span>
                  <input
                    id="login-email"
                    type="email"
                    value={email}
                    placeholder="seu@email.com.br"
                    autoComplete="email"
                    required
                    onChange={e => setEmail(e.target.value)}
                  />
                </div>
              </div>

              {/* Campo: Senha */}
              <div className="field">
                <label htmlFor="login-password">Senha</label>
                <div className="ip">
                  <span className="ip-icon"><Lock size={15} /></span>
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    autoComplete="current-password"
                    required
                    onChange={e => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="ip-eye"
                    onClick={() => setShowPassword(s => !s)}
                    title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* Manter conectado + Esqueci senha */}
              <div className="field-row">
                <label>
                  <input type="checkbox" defaultChecked />
                  Manter conectado
                </label>
                <a href="#">Esqueci minha senha</a>
              </div>

              {/* Mensagem de erro (só aparece se houver erro) */}
              {error && (
                <div className="login-error">
                  <span className="err-icon">!</span>
                  <span>{error}</span>
                </div>
              )}

              {/* Botão de submit */}
              <button type="submit" className="btn-primary orange" disabled={loading}>
                {loading
                  ? <Loader2 size={15} className="btn-spinner" />
                  : null}
                {loading ? 'Entrando...' : 'Entrar'}
                {!loading && <ArrowRight size={15} />}
              </button>

            </form>

            <p style={{
              textAlign: 'center',
              marginTop: 24,
              fontSize: 13,
              color: 'var(--ink-500)',
            }}>
              Primeiro acesso?{' '}
              <a
                href="#"
                style={{ color: 'var(--orange-600)', fontWeight: 600, textDecoration: 'none' }}
              >
                Solicite acesso à sua empresa
              </a>
            </p>

          </div>
        </div>

      </div>
    </>
  )
}
