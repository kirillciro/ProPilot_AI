import * as SecureStore from "expo-secure-store";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { PROFILES, type ProfileSlug } from "@propilot/shared";

const PROFILE_KEY = "propilot.profile";

type ProfileContextValue = {
  profile: ProfileSlug;
  label: string;
  setProfile: (slug: ProfileSlug) => void;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfileState] = useState<ProfileSlug>("automotive");

  useEffect(() => {
    SecureStore.getItemAsync(PROFILE_KEY)
      .then((raw) => {
        const found = PROFILES.find((p) => p.slug === raw);
        if (found) setProfileState(found.slug);
      })
      .catch(() => {});
  }, []);

  const setProfile = useCallback((slug: ProfileSlug) => {
    setProfileState(slug);
    SecureStore.setItemAsync(PROFILE_KEY, slug).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({
      profile,
      label: PROFILES.find((p) => p.slug === profile)?.label ?? profile,
      setProfile,
    }),
    [profile, setProfile],
  );
  return (
    <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used inside ProfileProvider");
  return ctx;
}
