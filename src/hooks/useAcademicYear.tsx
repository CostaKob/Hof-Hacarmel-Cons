import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface AcademicYear {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

interface AcademicYearContextType {
  years: AcademicYear[];
  activeYear: AcademicYear | null;
  selectedYearId: string | null;
  setSelectedYearId: (id: string | null) => void;
  isLoading: boolean;
}

const AcademicYearContext = createContext<AcademicYearContextType>({
  years: [],
  activeYear: null,
  selectedYearId: null,
  setSelectedYearId: () => {},
  isLoading: true,
});

export const AcademicYearProvider = ({ children }: { children: ReactNode }) => {
  const [selectedYearId, setSelectedYearId] = useState<string | null>(null);

  const { data: years = [], isLoading } = useQuery({
    queryKey: ["academic-years"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academic_years")
        .select("*")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data as AcademicYear[];
    },
  });

  const activeYear = years.find((y) => y.is_active) ?? null;

  useEffect(() => {
    if (!selectedYearId && activeYear) {
      setSelectedYearId(activeYear.id);
    }
  }, [activeYear, selectedYearId]);

  return (
    <AcademicYearContext.Provider value={{ years, activeYear, selectedYearId, setSelectedYearId, isLoading }}>
      {children}
    </AcademicYearContext.Provider>
  );
};

export const useAcademicYear = () => useContext(AcademicYearContext);
