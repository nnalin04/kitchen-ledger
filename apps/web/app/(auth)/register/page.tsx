'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { useAuthStore } from '@/stores/auth.store';

const schema = z
  .object({
    restaurantName: z
      .string()
      .min(2, 'Restaurant name must be at least 2 characters')
      .max(100, 'Restaurant name too long'),
    email: z.string().email('Invalid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
      .regex(/[0-9]/, 'Must contain at least one number'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type RegisterForm = z.infer<typeof schema>;

export default function RegisterPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [error, setError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: RegisterForm) => {
    setError('');
    try {
      const res = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'}/api/auth/register`,
        {
          restaurantName: data.restaurantName,
          email: data.email,
          password: data.password,
        },
      );
      const { accessToken, refreshToken, user, tenant } = res.data.data;
      setAuth(user, tenant, accessToken, refreshToken);
      router.replace('/setup');
    } catch (e: unknown) {
      if (axios.isAxiosError(e)) {
        setError(
          (e.response?.data as { error?: { message?: string } })?.error?.message ??
            'Registration failed. Please try again.',
        );
      } else {
        setError('An unexpected error occurred.');
      }
    }
  };

  return (
    <div className="w-full max-w-md p-8 bg-white rounded-2xl shadow-lg">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900">KitchenLedger</h1>
        <p className="text-gray-500 mt-2">Set up your restaurant account</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div>
          <label htmlFor="restaurantName" className="block text-sm font-medium text-gray-700 mb-1">
            Restaurant Name
          </label>
          <input
            id="restaurantName"
            {...register('restaurantName')}
            type="text"
            autoComplete="organization"
            placeholder="The Golden Spoon"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
          {errors.restaurantName && (
            <p className="mt-1 text-sm text-red-500" role="alert">
              {errors.restaurantName.message}
            </p>
          )}
        </div>

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

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            Password
          </label>
          <input
            id="password"
            {...register('password')}
            type="password"
            autoComplete="new-password"
            placeholder="Min 8 chars, 1 uppercase, 1 number"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
          {errors.password && (
            <p className="mt-1 text-sm text-red-500" role="alert">
              {errors.password.message}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="confirmPassword"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Confirm Password
          </label>
          <input
            id="confirmPassword"
            {...register('confirmPassword')}
            type="password"
            autoComplete="new-password"
            placeholder="••••••••"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
          {errors.confirmPassword && (
            <p className="mt-1 text-sm text-red-500" role="alert">
              {errors.confirmPassword.message}
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
          {isSubmitting ? 'Creating account…' : 'Create free account'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        Already have an account?{' '}
        <Link href="/login" className="text-blue-600 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
