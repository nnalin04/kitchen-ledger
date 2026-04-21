'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import axios from 'axios';

const schema = z.object({
  email: z.string().email('Invalid email address'),
});
type ForgotPasswordForm = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordForm>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: ForgotPasswordForm) => {
    setError('');
    try {
      await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'}/api/auth/forgot-password`,
        { email: data.email },
      );
      setSent(true);
    } catch (e: unknown) {
      // Surface a generic message — never reveal whether the email exists
      if (axios.isAxiosError(e) && e.response?.status !== 404) {
        setError('Something went wrong. Please try again.');
      } else {
        // Treat 404 / unknown as success to prevent user enumeration
        setSent(true);
      }
    }
  };

  if (sent) {
    return (
      <div className="w-full max-w-md p-8 bg-white rounded-2xl shadow-lg text-center">
        <div className="mb-4 flex justify-center">
          <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
            <svg
              className="w-7 h-7 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Check your inbox</h2>
        <p className="text-gray-500 mb-6">
          We&apos;ve sent a password reset link to your email address. The link expires in 1 hour.
        </p>
        <p className="text-sm text-gray-400">
          Didn&apos;t receive it? Check your spam folder or{' '}
          <button
            type="button"
            onClick={() => setSent(false)}
            className="text-blue-600 hover:underline"
          >
            try again
          </button>
          .
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block text-sm text-blue-600 hover:underline"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md p-8 bg-white rounded-2xl shadow-lg">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900">Forgot your password?</h1>
        <p className="text-gray-500 mt-2 text-sm">
          Enter your email and we&apos;ll send you a reset link.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            id="email"
            {...register('email')}
            type="email"
            autoComplete="email"
            placeholder="you@restaurant.com"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
          {errors.email && (
            <p className="mt-1 text-sm text-red-500" role="alert">
              {errors.email.message}
            </p>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSubmitting ? 'Sending…' : 'Send reset link'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        Remembered it?{' '}
        <Link href="/login" className="text-blue-600 hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
