import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { loadSettings } from "@/lib/settings";
import { C } from "@/constants/theme";

export default function Entry() {
  const [dest, setDest] = useState<any>(null);

  useEffect(() => {
    loadSettings().then((s) => {
      setDest(s.onboardingDone ? "/home" : "/onboarding");
    });
  }, []);

  if (!dest) return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  return <Redirect href={dest} />;
}
