import Link from 'next/link';
import EmptyState from '../components/ui/EmptyState';
import Button from '../components/ui/Button';

export default function NotFound() {
  return (
    <EmptyState
      title="Page not found"
      description="The job or page you're looking for doesn't exist."
      action={
        <Link href="/">
          <Button variant="secondary">← Go to Dashboard</Button>
        </Link>
      }
    />
  );
}
