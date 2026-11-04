import { useOutletContext } from "react-router-dom";
import type { EditionDTO, LeagueDTO } from "../../lib/types";

export interface LeagueContextValue {
  league: LeagueDTO;
  edition: EditionDTO;
}

export function useLeagueContext() {
  return useOutletContext<LeagueContextValue>();
}
