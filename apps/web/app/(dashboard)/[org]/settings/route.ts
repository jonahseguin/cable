import { redirect } from 'next/navigation';

export async function GET(request: Request, { params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  return redirect(`/${org}/settings/general`);
}
