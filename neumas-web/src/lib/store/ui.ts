"use client";
/**
 * Zustand UI store — ephemeral, not persisted.
 * Manages sidebar state, active property, notification count.
 */

import { create } from "zustand";

interface UIState {
  sidebarOpen: boolean;
  sidebarCollapsed: boolean;
  notificationCount: number;
}

interface UIActions {
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebarCollapsed: () => void;
  setNotificationCount: (n: number) => void;
}

export const useUIStore = create<UIState & UIActions>()((set) => ({
  sidebarOpen: true,
  sidebarCollapsed: false,
  notificationCount: 0,

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebarCollapsed: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setNotificationCount: (n) => set({ notificationCount: n }),
}));
