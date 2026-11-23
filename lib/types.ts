import type { Track } from 'livekit-client';

export type PInfo = {
  identity: string;
  name: string;
  isLocal: boolean;
  isHost: boolean;
  speaking: boolean;
  level: number;
  micOn: boolean;
  camOn: boolean;
  cam?: Track;
  screen?: Track;
  hand: boolean;
  joinedAt: number;
  /** 'waiting' while the host has not let this person in yet. */
  status: 'waiting' | 'in';
  blocked: boolean;
  label?: string;
  perms: string[];
  hue?: number;
  pic?: string;
};

export type RoomState = { wait: boolean; locked: boolean; interview: boolean };

export type ChatItem = { id: string; identity: string; from: string; text: string; ts: number; mine: boolean };
export type TxSeg = { id: string; identity: string; speaker: string; text: string; ts: number };
export type ReactionItem = { id: string; emoji: string; x: number };
export type LayoutMode = 'star' | 'grid' | 'speaker';

export type PersonNotes = {
  name: string;
  summary: string;
  strengths: string[];
  concerns: string[];
  quotes: string[];
  scores: { criterion: string; score: number; reason: string }[];
  experience?: string;
  answers?: { question: string; answer: string; verdict: 'correct' | 'partial' | 'incorrect' | 'unclear'; correction: string }[];
  accuracy?: number;
};

export type MeetingSummary = {
  summary: string;
  keyPoints: string[];
  decisions: string[];
  actionItems: { task: string; owner: string | null }[];
  people: PersonNotes[];
  followUps: string[];
};

export type CopilotResult = {
  nextQuestions: string[];
  tips: string[];
  coverage: { topic: string; covered: boolean }[];
};
