/** Public layout: no sidebar, no auth required. */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
