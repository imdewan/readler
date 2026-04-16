import { useCallback, useRef, useState } from "react";
import {
  isLoaded,
  loadModel,
  synthesize,
  preparePlayer,
  playPrepared,
  stop,
  clearBuffer,
} from "@/lib/tts";

export type Phase = "idle" | "loading" | "playing" | "paused" | "error";

const LOOKAHEAD = 5;

export function splitSentences(text: string): string[] {
  const cleaned = text.replace(/[●•◦▪▸▹►▻◆◇○■□★☆✦✧→←↑↓–—]/g, "");
  const lines = cleaned
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const sentences: string[] = [];
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const parts = line.match(/[^.!?…]+[.!?…]+[\s"]*/g);
    if (parts) {
      for (const p of parts) {
        const t = p.trim();
        if (t) sentences.push(t);
      }
      const consumed = parts.join("").length;
      const remainder = line.slice(consumed).trim();
      if (remainder) sentences.push(remainder);
    } else {
      sentences.push(line);
    }
    // Insert newline marker between paragraphs
    if (li < lines.length - 1) sentences.push("\n");
  }
  return sentences;
}

interface PreparedItem {
  wavPath: string;
  player: any;
}

export function useSentencePlayer(opts: { voice: string; speed: number }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const stoppedRef = useRef(false);
  const pausedRef = useRef(false);
  const pauseResolveRef = useRef<(() => void) | null>(null);
  const sentencesRef = useRef<string[]>([]);
  const resumeIndexRef = useRef(-1);

  const play = useCallback(
    async (text: string, startFrom = 0) => {
      stoppedRef.current = false;
      pausedRef.current = false;
      setError("");
      setActiveIndex(-1);
      setPhase("loading");
      await clearBuffer();

      if (!isLoaded()) {
        try {
          await loadModel();
        } catch (e) {
          setError(String(e));
          setPhase("error");
          return;
        }
      }

      const sentences = splitSentences(text);
      sentencesRef.current = sentences;

      const startIdx = Math.min(startFrom, sentences.length - 1);

      const speakOpts = { voice: opts.voice, speed: opts.speed };

      const ready = new Map<number, PreparedItem>();
      const waiters = new Map<number, (item: PreparedItem) => void>();

      let queueHead = 0;
      let queueRunning = false;

      const runQueue = async () => {
        if (queueRunning) return;
        queueRunning = true;

        while (queueHead < sentences.length && !stoppedRef.current) {
          const idx = queueHead;

          if (idx > activeIndexRef.current + LOOKAHEAD && activeIndexRef.current >= 0) {
            queueRunning = false;
            return;
          }

          if (ready.has(idx) || sentences[idx] === "\n") {
            queueHead++;
            continue;
          }

          queueHead++;

          try {
            const wavPath = await synthesize(sentences[idx], speakOpts);
            if (stoppedRef.current) break;
            const player = await preparePlayer(wavPath);
            if (stoppedRef.current) {
              player.release();
              break;
            }

            const item = { wavPath, player };

            const waiter = waiters.get(idx);
            if (waiter) {
              waiters.delete(idx);
              waiter(item);
            } else {
              ready.set(idx, item);
            }
          } catch (e) {
            if (!stoppedRef.current) {
              const waiter = waiters.get(idx);
              if (waiter) {
                waiters.delete(idx);
              }
            }
          }
        }

        queueRunning = false;
      };

      const activeIndexRef = { current: -1 };

      const getPrepared = (idx: number): Promise<PreparedItem> => {
        const existing = ready.get(idx);
        if (existing) {
          ready.delete(idx);
          return Promise.resolve(existing);
        }
        return new Promise<PreparedItem>((resolve) => {
          waiters.set(idx, resolve);
        });
      };

      // Pre-synthesize first 2 real sentences from startIdx
      let preloaded = 0;
      let preloadIdx = startIdx;
      while (preloaded < 2 && preloadIdx < sentences.length) {
        if (stoppedRef.current) break;
        if (sentences[preloadIdx] === "\n") { preloadIdx++; continue; }
        try {
          const wavPath = await synthesize(sentences[preloadIdx], speakOpts);
          if (stoppedRef.current) break;
          const player = await preparePlayer(wavPath);
          if (stoppedRef.current) { player.release(); break; }
          ready.set(preloadIdx, { wavPath, player });
        } catch {}
        preloadIdx++;
        preloaded++;
      }

      queueHead = preloadIdx;
      runQueue();

      // Playback loop — start from startIdx
      for (let i = startIdx; i < sentences.length; i++) {
        if (stoppedRef.current) break;

        // Skip newline markers (paragraph breaks)
        if (sentences[i] === "\n") {
          setActiveIndex(i);
          continue;
        }

        // Wait if paused
        if (pausedRef.current) {
          resumeIndexRef.current = i;
          await new Promise<void>((resolve) => {
            pauseResolveRef.current = resolve;
          });
          if (stoppedRef.current) break;
        }

        activeIndexRef.current = i;

        if (!queueRunning) runQueue();

        try {
          const prepared = await getPrepared(i);
          if (stoppedRef.current) {
            prepared.player.release();
            break;
          }
          if (i === startIdx) setPhase("playing");
          setActiveIndex(i);
          resumeIndexRef.current = i;
          await playPrepared(prepared.player);
        } catch (e) {
          if (!stoppedRef.current) {
            setError(String(e));
            setPhase("error");
            return;
          }
          break;
        }
      }

      // Clean up remaining buffer
      for (const [, item] of ready) {
        item.player.release();
      }
      ready.clear();
      clearBuffer();

      if (!stoppedRef.current && !pausedRef.current) {
        setActiveIndex(-1);
        setPhase("idle");
        resumeIndexRef.current = -1;
      }
    },
    [opts.voice, opts.speed],
  );

  const handlePause = useCallback(async () => {
    pausedRef.current = true;
    await stop();
    setPhase("paused");
  }, []);

  const handleResume = useCallback(() => {
    pausedRef.current = false;
    const resolve = pauseResolveRef.current;
    pauseResolveRef.current = null;
    if (resolve) {
      resolve();
    }
  }, []);

  const handleStop = useCallback(async () => {
    stoppedRef.current = true;
    pausedRef.current = false;
    // Unblock pause wait if any
    const resolve = pauseResolveRef.current;
    pauseResolveRef.current = null;
    if (resolve) resolve();
    await stop();
    setActiveIndex(-1);
    setPhase("idle");
    resumeIndexRef.current = -1;
    clearBuffer();
  }, []);

  return {
    phase,
    error,
    activeIndex,
    sentences: sentencesRef.current,
    pausedAtIndex: resumeIndexRef.current,
    play,
    pause: handlePause,
    resume: handleResume,
    stop: handleStop,
  };
}
