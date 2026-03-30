import { createContext, useContext, useState, ReactNode } from "react";

interface AIContextType {
  isOpen: boolean;
  openAI: () => void;
  closeAI: () => void;
  pageContext: any;
  setPageContext: (ctx: any) => void;
}

const AIContext = createContext<AIContextType | null>(null);

export function AIProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [pageContext, setPageContext] = useState<any>(null);

  const openAI = () => setIsOpen(true);
  const closeAI = () => setIsOpen(false);

  return (
    <AIContext.Provider value={{ isOpen, openAI, closeAI, pageContext, setPageContext }}>
      {children}
    </AIContext.Provider>
  );
}

export const useAI = () => {
  const context = useContext(AIContext);
  if (!context) throw new Error("useAI must be used within AIProvider");
  return context;
};
