import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { useAuth } from '@/modules/auth/AuthProvider'
import { supabase } from '@/lib/supabase'
import { handleSupabaseError } from '@/lib/errors'
import { Mail, Lock, Eye, EyeOff, ArrowRight, Loader2, HardHat, Target, ShieldCheck, TrendingUp, Eye as EyeIcon, Compass } from 'lucide-react'
import { BrandMark } from '@/components/ui/BrandMark'
import { APP_COPYRIGHT } from '@/config/brand'

// Os 5 pilares da marca Norveo (manual de marca)
const PILLARS = [
  { icon: Target,      label: 'Clareza' },
  { icon: ShieldCheck, label: 'Controle' },
  { icon: TrendingUp,  label: 'Antecipação' },
  { icon: EyeIcon,     label: 'Inteligência' },
  { icon: Compass,     label: 'Direção' },
]

const schema = z.object({
  email: z.string().min(1, 'Informe o e-mail').email('E-mail inválido'),
  password: z.string().min(6, 'A senha deve ter ao menos 6 caracteres'),
})

type FormValues = z.infer<typeof schema>

export default function LoginPage() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  })

  useEffect(() => {
    if (session) navigate('/', { replace: true })
  }, [session, navigate])

  async function onSubmit(values: FormValues) {
    const { error } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    })
    if (error) {
      const app = handleSupabaseError(error, 'Não foi possível autenticar.')
      const msg = error.message?.toLowerCase().includes('invalid')
        ? 'E-mail ou senha inválidos.'
        : app.message
      setError('password', { message: msg })
      toast.error(msg)
    }
    // sucesso: AuthProvider detecta sessão, useEffect redireciona
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
            <BrandMark />
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

            <div className="lpillars">
              {PILLARS.map(({ icon: Icon, label }) => (
                <div className="lpillar" key={label}>
                  <div className="lpillar-ic"><Icon size={17} /></div>
                  <div className="lpillar-label">{label}</div>
                </div>
              ))}
            </div>

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
            {APP_COPYRIGHT} · Política de privacidade
          </div>
        </div>

        {/* ═══════════════════════════════════════
            PAINEL DIREITO — Formulário de acesso
            ═══════════════════════════════════════ */}
        <div className="login-right">
          <div className="login-form">

            {/* Logo mobile (aparece só em telas pequenas) */}
            <div className="login-mobile-brand">
              <BrandMark size="sm" />
            </div>

            <h1>Acessar plataforma</h1>
            <p className="sub">Entre com suas credenciais para acessar a plataforma.</p>

            <form onSubmit={handleSubmit(onSubmit)} noValidate>

              {/* Campo: E-mail */}
              <div className="field">
                <label htmlFor="login-email">E-mail</label>
                <div className="ip">
                  <span className="ip-icon"><Mail size={15} /></span>
                  <input
                    id="login-email"
                    type="email"
                    placeholder="seu@email.com.br"
                    autoComplete="email"
                    aria-invalid={!!errors.email}
                    {...register('email')}
                  />
                </div>
                {errors.email && (
                  <span className="field-error" role="alert" style={{ color: 'var(--red-600, #dc2626)', fontSize: 12, marginTop: 4, display: 'block' }}>
                    {errors.email.message}
                  </span>
                )}
              </div>

              {/* Campo: Senha */}
              <div className="field">
                <label htmlFor="login-password">Senha</label>
                <div className="ip">
                  <span className="ip-icon"><Lock size={15} /></span>
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    aria-invalid={!!errors.password}
                    {...register('password')}
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
                {errors.password && (
                  <span className="field-error" role="alert" style={{ color: 'var(--red-600, #dc2626)', fontSize: 12, marginTop: 4, display: 'block' }}>
                    {errors.password.message}
                  </span>
                )}
              </div>

              {/* Manter conectado + Esqueci senha */}
              <div className="field-row">
                <label>
                  <input type="checkbox" defaultChecked />
                  Manter conectado
                </label>
                <a href="#">Esqueci minha senha</a>
              </div>

              {/* Botão de submit */}
              <button type="submit" className="btn-primary accent" disabled={isSubmitting}>
                {isSubmitting
                  ? <Loader2 size={15} className="btn-spinner" />
                  : null}
                {isSubmitting ? 'Entrando...' : 'Entrar'}
                {!isSubmitting && <ArrowRight size={15} />}
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
                style={{ color: 'var(--color-accent)', fontWeight: 600, textDecoration: 'none' }}
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
