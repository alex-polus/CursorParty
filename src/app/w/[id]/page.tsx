import { WorkspaceApp } from "@/components/WorkspaceApp";

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <WorkspaceApp workspaceId={id} />;
}
