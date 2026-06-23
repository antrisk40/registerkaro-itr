import PageHeader from '../../components/ui/PageHeader';
import LaunchJobForm from '../../components/jobs/LaunchJobForm';

export default function LaunchPage() {
  return (
    <>
      <PageHeader
        title="Launch Bot"
        description="Configure and start a new Playwright automation instance for PAN registration."
      />
      <div className="max-w-xl">
        <LaunchJobForm />
      </div>
    </>
  );
}
