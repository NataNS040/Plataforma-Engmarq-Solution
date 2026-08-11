import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Não autorizado' }, 401)

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Verify caller is a valid admin
    const { data: { user: caller }, error: verifyErr } =
      await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''))
    if (verifyErr || !caller) return json({ error: 'Token inválido' }, 401)

    const { data: callerProfile } = await supabaseAdmin
      .from('user_profiles')
      .select('role')
      .eq('id', caller.id)
      .single()

    if (callerProfile?.role !== 'admin') {
      return json({ error: 'Apenas administradores podem criar usuários' }, 403)
    }

    const { email, password, full_name, role, empresa_id } = await req.json()

    if (!email || !password || !full_name || !role || !empresa_id) {
      return json({ error: 'Campos obrigatórios: email, password, full_name, role, empresa_id' }, 400)
    }

    const validRoles = ['admin', 'gestor', 'operacional', 'empresa']
    if (!validRoles.includes(role)) {
      return json({ error: 'Papel inválido' }, 400)
    }

    // Create the auth user (email already confirmed)
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (createErr || !created.user) {
      return json({ error: createErr?.message ?? 'Erro ao criar usuário' }, 400)
    }

    // Create the profile
    const { error: profileErr } = await supabaseAdmin
      .from('user_profiles')
      .insert({
        id: created.user.id,
        email,
        full_name,
        role,
        empresa_id,
        active: true,
      })

    if (profileErr) {
      // Rollback auth user to avoid orphan
      await supabaseAdmin.auth.admin.deleteUser(created.user.id)
      return json({ error: 'Erro ao criar perfil: ' + profileErr.message }, 500)
    }

    return json({ user_id: created.user.id })
  } catch (_err) {
    return json({ error: 'Erro interno do servidor' }, 500)
  }
})
