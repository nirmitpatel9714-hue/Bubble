import { create } from "zustand";

type LeaderModeState = {
  active: boolean;
  setActive: (active: boolean) => void;
};

/** Whether the leader key was pressed and the next chord is awaited. */
export const useLeaderMode = create<LeaderModeState>((set) => ({
  active: false,
  setActive: (active) => set({ active }),
}));
