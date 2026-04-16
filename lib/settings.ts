import * as SecureStore from 'expo-secure-store';
import { File, Paths } from 'expo-file-system';

export type Gender = 'female' | 'male';

export interface AppSettings {
  onboardingDone: boolean;
  userName: string;
  gender: Gender;
  voice: string;
  speed: number;
}

const KEY = 'app_settings_v1';

export const DEFAULTS: AppSettings = {
  onboardingDone: false,
  userName: '',
  gender: 'female',
  voice: 'Bella',
  speed: 1.2,
};

export const FEMALE_VOICES = ['Bella', 'Luna', 'Rosie', 'Kiki'];
export const MALE_VOICES   = ['Jasper', 'Bruno', 'Hugo', 'Leo'];

export function voicesForGender(gender: Gender): string[] {
  return gender === 'female' ? FEMALE_VOICES : MALE_VOICES;
}

export const SPEED_OPTIONS = [
  { label: '0.5×',  value: 0.5  },
  { label: '0.75×', value: 0.75 },
  { label: '1×',    value: 1.0  },
  { label: '1.2×',  value: 1.2, recommended: true },
  { label: '1.5×',  value: 1.5  },
  { label: '1.75×', value: 1.75 },
  { label: '2×',    value: 2.0  },
];

export const VOICE_DESCRIPTIONS: Record<string, string> = {
  Bella:  'Warm & expressive',
  Luna:   'Calm & clear',
  Rosie:  'Bright & friendly',
  Kiki:   'Lively & energetic',
  Jasper: 'Deep & authoritative',
  Bruno:  'Smooth & rich',
  Hugo:   'Crisp & professional',
  Leo:    'Natural & relaxed',
};

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<void> {
  const current = await loadSettings();
  await SecureStore.setItemAsync(KEY, JSON.stringify({ ...current, ...patch }));
}

// ── Recent activity ──────────────────────────────────────────────────────────

export interface RecentItem {
  type: 'text' | 'pdf' | 'book';
  title: string;
  preview: string;
  fullText: string;
  words: number;
  timestamp: number;
}

const recentFile = new File(Paths.document, 'recent_activity_v1.json');

export async function loadRecent(): Promise<RecentItem[]> {
  try {
    if (!recentFile.exists) return [];
    const raw = await recentFile.text();
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export async function saveRecent(item: Omit<RecentItem, 'timestamp'>): Promise<void> {
  const list = await loadRecent();
  list.unshift({ ...item, timestamp: Date.now() });
  const trimmed = list.slice(0, 5);
  recentFile.write(JSON.stringify(trimmed));
}

export async function clearAllData(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
  if (recentFile.exists) recentFile.delete();
}
