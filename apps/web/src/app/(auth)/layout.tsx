/** Auth layout: centered card, no sidebar. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-50 to-gray-100 p-4">
      {children}
    </div>
  );
}
