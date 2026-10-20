import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import i18n from '../i18n/index.js';
import { api } from '../lib/api.js';
import { Button } from '../components/ui/Button.js';
import { useAuthStore } from '../store/auth.js';
import type { LoginResponse } from '../types/api.js';

// A tela de login é sempre exibida em português, independente do idioma do navegador do usuário.
const t = i18n.getFixedT('pt-BR');

export function LoginPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const user = useAuthStore((s) => s.user);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit } = useForm({ defaultValues: { email: '', password: '' } });

  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);

  const onSubmit = async (data: { email: string; password: string }) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.post<LoginResponse>('/auth/login', data);
      setSession({ accessToken: res.data.accessToken, refreshToken: res.data.refreshToken }, res.data.user);
      navigate('/', { replace: true });
    } catch {
      setError(t('login.invalid'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-navy px-4 py-10" style={{ backgroundImage: 'radial-gradient(circle at 85% 10%, #343584 0%, transparent 42%), radial-gradient(circle at 5% 95%, #292a72 0%, transparent 40%)' }}>
      <div className="w-full max-w-md rounded-2xl border border-white/15 bg-white p-8 shadow-2xl sm:p-10">
        <div className="mb-8 text-center">
          <img src="/tudo-voip-horizontal.png" alt="Tudo VoIP · Telefonia em Nuvem" className="mx-auto mb-6 w-full max-w-[280px] object-contain" />
          <h1 className="text-2xl font-bold text-brand-navy">{t('app.loginTitle')}</h1>
          <p className="mt-2 text-sm text-slate-500">{t('app.loginSubtitle')}</p>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="label">{t('app.email')}</label>
            <input {...register('email')} type="email" required className="input" />
          </div>
          <div>
            <label className="label">{t('app.password')}</label>
            <input {...register('password')} type="password" required className="input" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" loading={loading} className="w-full">
            {loading ? t('app.signingIn') : t('app.signIn')}
          </Button>
        </form>
      </div>
    </div>
  );
}
