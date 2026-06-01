import { redirect } from 'next/navigation';

export default function PublishJobsIndexPage() {
  redirect('/publish/queue');
}
