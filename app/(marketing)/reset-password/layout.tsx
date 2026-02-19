// Force this route to be dynamically rendered
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default function ResetPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
