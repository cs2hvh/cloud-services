'use client';

import { useState, useEffect } from 'react';
import { formatUptime } from '../_components/types';

export function useUptime(startDate: string | null | undefined, isRunning: boolean) {
  const [uptime, setUptime] = useState('');
  useEffect(() => {
    if (!startDate || !isRunning) { setUptime('—'); return; }
    setUptime(formatUptime(startDate));
    const id = setInterval(() => setUptime(formatUptime(startDate)), 1000);
    return () => clearInterval(id);
  }, [startDate, isRunning]);
  return uptime;
}
