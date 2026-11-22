import type { Metadata } from 'next';
import MeetingApp from '@/components/meeting/MeetingApp';

export const metadata: Metadata = { title: 'Meeting', robots: { index: false, follow: false } };

export default async function MeetingPage({ params }: { params: Promise<{ room: string }> }) {
  const { room } = await params;
  return <MeetingApp room={decodeURIComponent(room)} />;
}
