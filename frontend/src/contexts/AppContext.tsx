import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { useTheme } from './ThemeContext';

interface AppState {
  crisisMode: boolean;
  setCrisisMode: (v: boolean) => void;
  bedtime: string;
  wakeTime: string;
  sleepGoal: number;
  currentSleepHours: number;
  streak: number;
  consistencyScore: number;
  emotionalCheckIn: string | null;
  setEmotionalCheckIn: (v: string | null) => void;
}

const AppContext = createContext<AppState | null>(null);

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be inside AppProvider');
  return ctx;
};

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [crisisMode, setCrisisMode] = useState(false);
  const [emotionalCheckIn, setEmotionalCheckIn] = useState<string | null>(null);
  const { setTheme } = useTheme();

  useEffect(() => {
    if (crisisMode) {
      setTheme('dark');
    }
  }, [crisisMode, setTheme]);

  const value: AppState = {
    crisisMode,
    setCrisisMode,
    bedtime: '11:00 PM',
    wakeTime: '7:00 AM',
    sleepGoal: 8,
    currentSleepHours: 6.75,
    streak: 14,
    consistencyScore: 78,
    emotionalCheckIn,
    setEmotionalCheckIn,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
