import { useCallback, useRef, useState } from "react";
import { isLoaded, loadModel, speak, stop } from "@/lib/tts";

export type Phase = "idle" | "loading" | "playing" | "error";

function splitSentences(text: string): string[] {
  const cleaned = text.replace(/[●•◦▪▸▹►▻◆◇○■□★☆✦✧→←↑↓–—]/g, "");
  const lines = cleaned
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const sentences: string[] = [];
  for (const line of lines) {
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
  }
  return sentences;
}

export function useSentencePlayer(opts: { voice: string; speed: number }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const stoppedRef = useRef(false);
  const sentencesRef = useRef<string[]>([]);

  const play = useCallback(
    async (text: string) => {
      stoppedRef.current = false;
      setError("");
      setActiveIndex(-1);

      if (!isLoaded()) {
        setPhase("loading");
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
      setPhase("playing");

      for (let i = 0; i < sentences.length; i++) {
        if (stoppedRef.current) break;
        setActiveIndex(i);
        try {
          await speak(sentences[i], { voice: opts.voice, speed: opts.speed });
        } catch (e) {
          if (!stoppedRef.current) {
            setError(String(e));
            setPhase("error");
            return;
          }
          break;
        }
      }

      if (!stoppedRef.current) {
        setActiveIndex(-1);
        setPhase("idle");
      }
    },
    [opts.voice, opts.speed],
  );

  const handleStop = useCallback(async () => {
    stoppedRef.current = true;
    await stop();
    setActiveIndex(-1);
    setPhase("idle");
  }, []);

  return {
    phase,
    error,
    activeIndex,
    sentences: sentencesRef.current,
    play,
    stop: handleStop,
  };
}
