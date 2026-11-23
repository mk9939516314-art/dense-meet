import type { Metadata } from 'next';
import HistoryView from '@/components/HistoryView';

export const metadata: Metadata = { title: 'History · Dense Meet', robots: { index: false } };

export default function Page() {
  return <HistoryView />;
}
