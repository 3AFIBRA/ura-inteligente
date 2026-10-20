import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuthStore } from '../store/auth.js';
import type { LoginResponse } from '../types/api.js';

export function LoginPage() {
  const { t } = useTranslation();
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
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-lg">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-slate-900">{t('app.loginTitle')}</h1>
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
          <button type="submit" disabled={loading} className="btn btn-primary w-full">
            {loading ? t('app.signingIn') : t('app.signIn')}
          </button>
        </form>
      </div>
    </div>
  );
}
