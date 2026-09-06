'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const DEFAULT_HOME_PATH = '/meow/bill';

export default function MeowEntryPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(DEFAULT_HOME_PATH);
  }, [router]);

  return null;
}