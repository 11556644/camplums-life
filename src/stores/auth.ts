import { create } from "zustand";

interface User {
  id: string;
  nickname: string;
  phone: string;
  studentId?: string;
  department?: string;
  dormitory?: string;
  roomNumber?: string;
  enrollYear?: number;
  avatar?: string;
  status: string;
  roles: string[];
  creditScore: number;
  school: { id: string; name: string };
  createdAt: string;
}

interface AuthStore {
  user: User | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  fetchUser: () => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  loading: true,
  setUser: (user) => set({ user, loading: false }),
  fetchUser: async () => {
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      if (data.success) {
        set({ user: data.data, loading: false });
      } else {
        set({ user: null, loading: false });
      }
    } catch {
      set({ user: null, loading: false });
    }
  },
  logout: async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    set({ user: null });
    window.location.href = "/login";
  },
}));
