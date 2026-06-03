'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const ACCOUNT_KEY = 'account';
const JOEY_HOME_PATH = '/meow/time';
const DEFAULT_HOME_PATH = '/meow/bill';

const resolveHomePath = (account: string | null) => (account === 'joey' ? JOEY_HOME_PATH : DEFAULT_HOME_PATH);

export default function MeowEntryPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(resolveHomePath(window.localStorage.getItem(ACCOUNT_KEY)));
  }, [router]);

  return null;
}