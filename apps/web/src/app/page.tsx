import { redirect } from 'next/navigation';

export default function Home() {
  // CRM pipeline is the primary product surface now.
  redirect('/leads');
}
