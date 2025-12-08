import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Language = 'zh' | 'en';

interface LanguageState {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
}

export const useLanguageStore = create<LanguageState>()(
  persist(
    (set, get) => ({
      language: 'zh',
      setLanguage: (lang) => set({ language: lang }),
      toggleLanguage: () => {
        const next = get().language === 'zh' ? 'en' : 'zh';
        set({ language: next });
      },
    }),
    {
      name: 'x-mozi-language',
    }
  )
);
