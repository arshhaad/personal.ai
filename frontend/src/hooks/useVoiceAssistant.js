import { useState, useEffect, useRef, useCallback } from 'react';

const FEMALE_VOICE_HINTS = [
  'aria',
  'jenny',
  'emma',
  'ava',
  'michelle',
  'zira',
  'samantha',
  'victoria',
  'karen',
  'serena',
  'kate',
  'fiona',
  'tessa',
  'moira',
  'sonia',
  'libby',
  'maisie',
  'neerja',
  'swara',
  'heera',
  'hazel',
  'susan',
  'linda',
  'catherine',
  'veena',
  'allison',
  'nicky',
  'google uk english female',
  'google us english',
  'female',
  'woman',
];

const MALE_VOICE_HINTS = [
  'david',
  'mark',
  'george',
  'ryan',
  'guy',
  'christopher',
  'eric',
  'steffan',
  'prabhat',
  'ravi',
  'daniel',
  'fred',
  'arthur',
  'oliver',
  'male',
];

function pickPreferredFemaleVoice(voices) {
  if (!Array.isArray(voices) || voices.length === 0) return null;

  const isFemaleMatch = (v) => {
    const label = `${v.name || ''} ${v.voiceURI || ''}`.toLowerCase();
    return FEMALE_VOICE_HINTS.some((hint) => label.includes(hint));
  };

  const isMaleMatch = (v) => {
    const label = `${v.name || ''} ${v.voiceURI || ''}`.toLowerCase();
    return MALE_VOICE_HINTS.some((hint) => label.includes(hint)) && !label.includes('female');
  };

  const englishVoices = voices.filter((v) => String(v.lang || '').toLowerCase().startsWith('en'));
  const pool = englishVoices.length > 0 ? englishVoices : voices;

  // Prefer ranked female voice hints in order
  for (const hint of FEMALE_VOICE_HINTS) {
    const match = pool.find((v) => `${v.name || ''} ${v.voiceURI || ''}`.toLowerCase().includes(hint));
    if (match) return match;
  }

  // Fallback to any voice matching female hints across all languages
  const anyFemale = voices.find(isFemaleMatch);
  if (anyFemale) return anyFemale;

  // Fallback to first non-male voice
  return pool.find((v) => !isMaleMatch(v)) || pool[0] || null;
}

export function stripMarkdownForSpeech(text) {
  if (!text) return '';
  return text
    .replace(/```[\s\S]*?```/g, ' code snippet omitted. ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~>-]{1,3}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function useVoiceAssistant({ onTranscript, onSpeechEnd, onError } = {}) {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakingId, setSpeakingId] = useState(null);
  const [voices, setVoices] = useState([]);

  const recognitionRef = useRef(null);
  const cancelledRef = useRef(false);
  const latestTranscriptRef = useRef('');
  const onTranscriptRef = useRef(onTranscript);
  const onSpeechEndRef = useRef(onSpeechEnd);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
    onSpeechEndRef.current = onSpeechEnd;
    onErrorRef.current = onError;
  }, [onTranscript, onSpeechEnd, onError]);

  const sttSupported =
    typeof window !== 'undefined' &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  const ttsSupported =
    typeof window !== 'undefined' && 'speechSynthesis' in window;

  useEffect(() => {
    if (!ttsSupported) return;

    const loadVoices = () => {
      const available = window.speechSynthesis.getVoices() || [];
      setVoices(available);
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
      window.speechSynthesis.cancel();
    };
  }, [ttsSupported]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore cleanup stop errors
        }
      }
    };
  }, []);

  const cancelListening = useCallback(() => {
    cancelledRef.current = true;
    latestTranscriptRef.current = '';
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
    }
    setIsListening(false);
  }, []);

  const stopListening = useCallback(() => {
    cancelledRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }
    setIsListening(false);
  }, []);

  const startListening = useCallback(() => {
    if (!sttSupported) {
      if (onErrorRef.current) {
        onErrorRef.current('Voice input is not supported in this browser. Try Chrome, Edge, or Safari.');
      }
      return;
    }

    if (isListening) {
      stopListening();
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = (typeof navigator !== 'undefined' && navigator.language) || 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    cancelledRef.current = false;
    latestTranscriptRef.current = '';

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event) => {
      if (cancelledRef.current) return;
      let finalText = '';
      let interimText = '';
      for (let i = 0; i < event.results.length; i++) {
        const chunk = event.results[i][0]?.transcript || '';
        if (event.results[i].isFinal) {
          finalText += chunk;
        } else {
          interimText += chunk;
        }
      }
      const combined = `${finalText}${interimText}`.replace(/\s+/g, ' ').trim();
      latestTranscriptRef.current = combined;

      if (onTranscriptRef.current && combined) {
        onTranscriptRef.current(combined, Boolean(finalText && !interimText));
      }
    };

    recognition.onerror = (event) => {
      setIsListening(false);
      if (cancelledRef.current || event.error === 'aborted') {
        return;
      }
      let msg = 'Voice recognition error.';
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        msg = 'Microphone permission was denied. Please allow microphone access.';
      } else if (event.error === 'audio-capture') {
        msg = 'No microphone was found. Please check your audio input device.';
      } else if (event.error === 'no-speech') {
        msg = 'No speech detected. Tap the mic and speak clearly.';
      } else if (event.error === 'network') {
        msg = 'Speech service blocked or offline. If using Brave, allow Google Speech/Web Speech in settings or use Chrome/Edge.';
      }
      if (onErrorRef.current) {
        onErrorRef.current(msg);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      const finishedText = latestTranscriptRef.current;
      const wasCancelled = cancelledRef.current;
      cancelledRef.current = false;
      latestTranscriptRef.current = '';

      if (!wasCancelled && finishedText && onSpeechEndRef.current) {
        onSpeechEndRef.current(finishedText);
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      setIsListening(false);
    }
  }, [sttSupported, isListening, stopListening]);

  const stopSpeaking = useCallback(() => {
    if (ttsSupported) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    setSpeakingId(null);
  }, [ttsSupported]);

  const speak = useCallback((text, id = 'default', options = {}) => {
    if (!ttsSupported) {
      if (onErrorRef.current) {
        onErrorRef.current('Text-to-speech is not supported in this browser.');
      }
      return;
    }

    // If clicking stop on currently speaking item
    if (isSpeaking && speakingId === id) {
      stopSpeaking();
      return;
    }

    const plain = stripMarkdownForSpeech(text);
    if (!plain) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(plain);
    utterance.rate = Math.min(2.0, Math.max(0.5, Number(options.rate) || 1.0));
    utterance.pitch = typeof options.pitch === 'number' ? options.pitch : 1.08;

    const availableVoices = voices.length > 0 ? voices : (window.speechSynthesis.getVoices() || []);
    if (options.voiceURI && availableVoices.length > 0) {
      const selected = availableVoices.find((v) => v.voiceURI === options.voiceURI);
      if (selected) utterance.voice = selected;
    } else {
      const femaleVoice = pickPreferredFemaleVoice(availableVoices);
      if (femaleVoice) utterance.voice = femaleVoice;
    }

    utterance.onstart = () => {
      setIsSpeaking(true);
      setSpeakingId(id);
    };
    utterance.onend = () => {
      setIsSpeaking(false);
      setSpeakingId(null);
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      setSpeakingId(null);
    };

    window.speechSynthesis.speak(utterance);
  }, [ttsSupported, isSpeaking, speakingId, stopSpeaking, voices]);

  return {
    sttSupported,
    ttsSupported,
    isListening,
    isSpeaking,
    speakingId,
    voices,
    startListening,
    stopListening,
    cancelListening,
    speak,
    stopSpeaking,
  };
}
