import React from 'react';

export interface OfflineBannerProps {
  isOffline: boolean;
  message?: string;
}

export function OfflineBanner({ isOffline, message = "You're offline — changes will sync when reconnected" }: OfflineBannerProps) {
  if (!isOffline) return null;
  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-400 text-amber-900 text-sm font-medium text-center py-2 px-4 shadow-md">
      <span className="mr-2">⚡</span>
      {message}
    </div>
  );
}
