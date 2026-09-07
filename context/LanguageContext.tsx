import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type Lang = "es" | "en";

const LANG_KEY = "@cashly_lang";

type LanguageContextValue = {
  lang: Lang;
  setLang: (lang: Lang) => Promise<void>;
};

const LanguageContext = createContext<LanguageContextValue>({
  lang: "es",
  setLang: async () => {},
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("es");

  useEffect(() => {
    AsyncStorage.getItem(LANG_KEY).then((val) => {
      if (val === "en" || val === "es") setLangState(val);
    });
  }, []);

  const setLang = useCallback(async (newLang: Lang) => {
    setLangState(newLang);
    await AsyncStorage.setItem(LANG_KEY, newLang);
  }, []);

  return (
    <LanguageContext.Provider value={{ lang, setLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
