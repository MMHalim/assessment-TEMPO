import AssessmentRunner from "@/components/AssessmentRunner";

export default async function AssessmentAttemptPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const { attemptId } = await params;

  return (
    <AssessmentRunner attemptId={attemptId} />
  );
}
